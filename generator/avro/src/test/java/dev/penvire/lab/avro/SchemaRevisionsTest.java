package dev.penvire.lab.avro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.penvire.lab.avro.SchemaRevisions.InvalidSchemasException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SchemaRevisionsTest {

  private static final String NAME = "dev.penvire.lab.identity.events.v1.KeyActivated";

  @TempDir Path avro;

  private static String record(String name, String fields) {
    int dot = name.lastIndexOf('.');
    return """
        {"type": "record", "namespace": "%s", "name": "%s", "fields": [%s]}"""
        .formatted(name.substring(0, dot), name.substring(dot + 1), fields);
  }

  private static final String KEY_ID = "{\"name\": \"keyId\", \"type\": \"string\"}";

  private void write(String dir, String file, String content) throws IOException {
    Files.createDirectories(avro.resolve(dir));
    Files.writeString(avro.resolve(dir).resolve(file), content);
  }

  private List<String> problems() {
    return assertThrows(InvalidSchemasException.class, () -> SchemaRevisions.load(avro, "identity"))
        .problems();
  }

  private void assertProblem(String expected) {
    List<String> problems = problems();
    assertTrue(
        problems.stream().anyMatch(problem -> problem.contains(expected)),
        () -> "expected a problem containing \"" + expected + "\", got " + problems);
  }

  @Test
  void loadsEveryRevisionAndExposesTheLatest() throws IOException {
    write(NAME, "1.avsc", record(NAME, KEY_ID));
    write(
        NAME,
        "2.avsc",
        record(NAME, KEY_ID + ", {\"name\": \"alg\", \"type\": \"string\", \"default\": \"RS256\"}"));

    List<SchemaRevisions> schemas = SchemaRevisions.load(avro, "identity");

    assertEquals(1, schemas.size());
    assertEquals(NAME, schemas.getFirst().fullName());
    assertEquals(2, schemas.getFirst().revisions().size());
    assertEquals(2, schemas.getFirst().latest().getFields().size());
  }

  @Test
  void aFieldAddedWithoutDefaultBreaksBackwardCompatibility() throws IOException {
    write(NAME, "1.avsc", record(NAME, KEY_ID));
    write(NAME, "2.avsc", record(NAME, KEY_ID + ", {\"name\": \"alg\", \"type\": \"string\"}"));

    assertProblem("revision 2 cannot read revision 1");
  }

  @Test
  void compatibilityIsTransitive() throws IOException {
    String withAlg = KEY_ID + ", {\"name\": \"alg\", \"type\": \"string\", \"default\": \"RS256\"}";
    write(NAME, "1.avsc", record(NAME, KEY_ID));
    write(NAME, "2.avsc", record(NAME, withAlg));
    // Revision 3 reads revision 2 but drops the default revision 1 needs.
    write(NAME, "3.avsc", record(NAME, KEY_ID + ", {\"name\": \"alg\", \"type\": \"string\"}"));

    List<String> problems = problems();
    assertEquals(1, problems.size(), problems::toString);
    assertTrue(problems.getFirst().contains("revision 3 cannot read revision 1"));
  }

  private static String field(String name, String type) {
    return "{\"name\": \"%s\", \"type\": %s}".formatted(name, type);
  }

  private static final String MILLIS = "{\"type\": \"long\", \"logicalType\": \"timestamp-millis\"}";

  @Test
  void aChangedLogicalTypeIsRejectedThoughAvroCallsItCompatible() throws IOException {
    write(NAME, "1.avsc", record(NAME, field("expiresAt", MILLIS)));
    write(
        NAME,
        "2.avsc",
        record(NAME, field("expiresAt", "{\"type\": \"long\", \"logicalType\": \"timestamp-micros\"}")));

    assertProblem("changes the logical type at <" + NAME + ">/expiresAt<long> from timestamp-millis to timestamp-micros");
  }

  @Test
  void addingOrDroppingALogicalTypeIsAChangeToo() throws IOException {
    write(NAME, "1.avsc", record(NAME, field("expiresAt", "\"long\"")));
    write(NAME, "2.avsc", record(NAME, field("expiresAt", MILLIS)));

    assertProblem("from none to timestamp-millis");
  }

  @Test
  void renamingAFieldWithAnAliasDoesNotHideALogicalTypeChange() throws IOException {
    write(NAME, "1.avsc", record(NAME, field("expiresAt", MILLIS)));
    write(
        NAME,
        "2.avsc",
        record(NAME, """
            {"name": "expiry", "aliases": ["expiresAt"],
             "type": {"type": "long", "logicalType": "timestamp-micros"}}"""));

    assertProblem("/expiry<long> from timestamp-millis to timestamp-micros");
  }

  @Test
  void promotingAValueIntoAReaderUnionDoesNotHideALogicalTypeChange() throws IOException {
    String date = "{\"type\": \"int\", \"logicalType\": \"date\"}";
    write(NAME, "1.avsc", record(NAME, field("expiry", "[\"null\", " + date + "]")));
    write(NAME, "2.avsc", record(NAME, field("expiry", "[\"null\", " + MILLIS + "]")));

    assertProblem("/expiry<long> from date to timestamp-millis");
  }

  @Test
  void decimalPrecisionAndScaleArePartOfTheLogicalType() throws IOException {
    String decimal = "{\"type\": \"bytes\", \"logicalType\": \"decimal\", \"precision\": %d, \"scale\": 2}";
    write(NAME, "1.avsc", record(NAME, field("amount", decimal.formatted(9))));
    write(NAME, "2.avsc", record(NAME, field("amount", decimal.formatted(12))));

    assertProblem("from decimal(9,2) to decimal(12,2)");
  }

  @Test
  void makingAFieldNullableKeepsItsLogicalType() throws IOException {
    write(NAME, "1.avsc", record(NAME, field("expiresAt", MILLIS)));
    write(NAME, "2.avsc", record(NAME, field("expiresAt", "[\"null\", " + MILLIS + "]")));

    assertEquals(2, SchemaRevisions.load(avro, "identity").getFirst().revisions().size());
  }

  @Test
  void logicalTypesAreComparedInsideNestedRecordsAndArrays() throws IOException {
    String nested = "{\"type\": \"array\", \"items\": {\"type\": \"record\", \"name\": \"Window\", \"fields\": [%s]}}";
    write(NAME, "1.avsc", record(NAME, field("windows", nested.formatted(field("from", MILLIS)))));
    write(
        NAME,
        "2.avsc",
        record(NAME, field("windows", nested.formatted(field("from", "{\"type\": \"long\", \"logicalType\": \"timestamp-micros\"}")))));

    assertProblem("/windows<array>[]<dev.penvire.lab.identity.events.v1.Window>/from<long>");
  }

  @Test
  void revisionsStartAtOneWithoutGaps() throws IOException {
    write(NAME, "1.avsc", record(NAME, KEY_ID));
    write(NAME, "3.avsc", record(NAME, KEY_ID));

    assertProblem("revision 2 is missing");
  }

  @Test
  void theFullNameMatchesTheDirectory() throws IOException {
    write(NAME, "1.avsc", record("dev.penvire.lab.identity.events.v1.Other", KEY_ID));

    assertProblem("full name is dev.penvire.lab.identity.events.v1.Other");
  }

  @Test
  void theNamespaceBelongsToTheServiceAndCarriesAMajor() throws IOException {
    String foreign = "dev.penvire.lab.tenant.events.v1.KeyActivated";
    write(foreign, "1.avsc", record(foreign, KEY_ID));

    assertProblem("expected dev.penvire.lab.identity.events.v<major>.<RecordName>");
  }

  @Test
  void onlyNumberedAvscFilesAreRevisions() throws IOException {
    write(NAME, "1.avsc", record(NAME, KEY_ID));
    write(NAME, "latest.avsc", record(NAME, KEY_ID));

    assertProblem("latest.avsc: expected <revision>.avsc");
  }

  @Test
  void aSchemaMustParseAndBeARecord() throws IOException {
    write(NAME, "1.avsc", "{\"type\": \"strng\"}");
    String other = "dev.penvire.lab.identity.events.v1.Plain";
    write(other, "1.avsc", "\"string\"");

    List<String> problems = problems();
    assertTrue(problems.stream().anyMatch(p -> p.startsWith(NAME + "/1.avsc")), problems::toString);
    assertTrue(problems.stream().anyMatch(p -> p.contains("must be a record")), problems::toString);
  }
}
