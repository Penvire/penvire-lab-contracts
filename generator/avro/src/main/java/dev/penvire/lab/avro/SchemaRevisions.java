package dev.penvire.lab.avro;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.apache.avro.LogicalType;
import org.apache.avro.LogicalTypes;
import org.apache.avro.Resolver;
import org.apache.avro.Schema;
import org.apache.avro.SchemaCompatibility;
import org.apache.avro.SchemaCompatibility.SchemaCompatibilityType;
import org.apache.avro.SchemaParseException;

/**
 * Every revision of one event schema, read from {@code <avro dir>/<full name>/<revision>.avsc}.
 * Revisions are numbered from 1 without gaps, and each one can read events written with any
 * earlier one (backward transitive) without changing a logical type (ADR 0004 in penvire-lab-backend).
 */
public record SchemaRevisions(String fullName, List<Schema> revisions) {

  private static final Pattern REVISION_FILE = Pattern.compile("([1-9][0-9]*)\\.avsc");

  public SchemaRevisions {
    revisions = List.copyOf(revisions);
  }

  /** The newest revision; consumers compile against it. */
  public Schema latest() {
    return revisions.getLast();
  }

  /**
   * Reads every schema below {@code avroDir} for {@code service}.
   *
   * @throws InvalidSchemasException listing every problem found, not only the first
   */
  public static List<SchemaRevisions> load(Path avroDir, String service) {
    List<String> problems = new ArrayList<>();
    List<SchemaRevisions> result = new ArrayList<>();
    String namespacePrefix = "dev.penvire.lab." + service + ".events.v";
    for (Path dir : list(avroDir)) {
      String name = dir.getFileName().toString();
      if (!Files.isDirectory(dir)) {
        problems.add(name + ": expected a directory named after a schema's full name");
        continue;
      }
      if (!Pattern.matches(Pattern.quote(namespacePrefix) + "[1-9][0-9]*\\.[A-Z][A-Za-z0-9]*", name)) {
        problems.add(name + ": expected " + namespacePrefix + "<major>.<RecordName>");
      }
      int before = problems.size();
      List<Schema> revisions = readRevisions(dir, name, problems);
      if (problems.size() == before) {
        checkCompatibility(name, revisions, problems);
        result.add(new SchemaRevisions(name, revisions));
      }
    }
    if (!problems.isEmpty()) {
      throw new InvalidSchemasException(problems);
    }
    return result;
  }

  private static List<Schema> readRevisions(Path dir, String name, List<String> problems) {
    Map<Integer, Path> files = new TreeMap<>();
    for (Path file : list(dir)) {
      var matcher = REVISION_FILE.matcher(file.getFileName().toString());
      if (matcher.matches()) {
        files.put(Integer.parseInt(matcher.group(1)), file);
      } else {
        problems.add(name + "/" + file.getFileName() + ": expected <revision>.avsc, e.g. 1.avsc");
      }
    }
    if (files.isEmpty()) {
      problems.add(name + ": has no revisions");
    }
    List<Schema> revisions = new ArrayList<>();
    int expected = 1;
    for (var entry : files.entrySet()) {
      if (entry.getKey() != expected) {
        problems.add(name + ": revision " + expected + " is missing");
        expected = entry.getKey();
      }
      expected++;
      String label = name + "/" + entry.getKey() + ".avsc";
      try {
        // A fresh parser per file: revisions redefine the same named types.
        Schema schema = new Schema.Parser().parse(entry.getValue().toFile());
        if (schema.getType() != Schema.Type.RECORD) {
          problems.add(label + ": must be a record, not " + schema.getType());
        } else if (!schema.getFullName().equals(name)) {
          problems.add(label + ": full name is " + schema.getFullName() + ", directory is " + name);
        }
        revisions.add(schema);
      } catch (SchemaParseException | IOException e) {
        problems.add(label + ": " + e.getMessage());
      }
    }
    return revisions;
  }

  private static void checkCompatibility(String name, List<Schema> revisions, List<String> problems) {
    for (int reader = 1; reader < revisions.size(); reader++) {
      for (int writer = 0; writer < reader; writer++) {
        var result =
            SchemaCompatibility.checkReaderWriterCompatibility(
                revisions.get(reader), revisions.get(writer));
        if (result.getType() != SchemaCompatibilityType.COMPATIBLE) {
          var reasons =
              result.getResult().getIncompatibilities().stream()
                  .map(i -> i.getType() + " " + i.getMessage() + " at " + i.getLocation())
                  .toList();
          problems.add(
              "%s: revision %d cannot read revision %d: %s"
                  .formatted(name, reader + 1, writer + 1, String.join("; ", reasons)));
        } else {
          Schema writerSchema = revisions.get(writer);
          List<String> changes = new ArrayList<>();
          collectLogicalTypeChanges(
              Resolver.resolve(writerSchema, revisions.get(reader)), writerSchema, "",
              changes, Collections.newSetFromMap(new IdentityHashMap<>()));
          for (String change : changes) {
            problems.add("%s: revision %d %s (revision %d)".formatted(name, reader + 1, change, writer + 1));
          }
        }
      }
    }
  }

  /**
   * Avro resolves by encoded type only: {@code timestamp-millis} to {@code timestamp-micros} is
   * "compatible" but turns every value into a different instant. Follow Avro's resolved pairs
   * so aliases, promotions, and union branches still compare the values the reader sees.
   */
  private static void collectLogicalTypeChanges(
      Resolver.Action action, Schema writer, String path, List<String> changes,
      Set<Resolver.Action> visiting) {
    if (action instanceof Resolver.WriterUnion union) {
      for (int i = 0; i < union.actions.length; i++) {
        collectLogicalTypeChanges(union.actions[i], writer.getTypes().get(i), path, changes, visiting);
      }
      return;
    }
    if (action instanceof Resolver.ReaderUnion union) {
      collectLogicalTypeChanges(union.actualAction, writer, path, changes, visiting);
      return;
    }
    if (action instanceof Resolver.Skip || action instanceof Resolver.ErrorAction || !visiting.add(action)) {
      return;
    }

    String key = path + "<" + typeKey(action.reader) + ">";
    // Use the original writer schema: applying aliases can rebuild named schemas.
    String before = describeLogicalType(writer);
    String after = describeLogicalType(action.reader);
    if (!before.equals(after)) {
      changes.add("changes the logical type at %s from %s to %s".formatted(key, before, after));
    }
    if (action instanceof Resolver.RecordAdjust record) {
      for (int i = 0, j = 0; i < record.fieldActions.length; i++) {
        Resolver.Action field = record.fieldActions[i];
        if (!(field instanceof Resolver.Skip)) {
          collectLogicalTypeChanges(
              field, writer.getFields().get(i).schema(), key + "/" + record.readerOrder[j++].name(),
              changes, visiting);
        }
      }
    } else if (action instanceof Resolver.Container container) {
      if (writer.getType() == Schema.Type.ARRAY) {
        collectLogicalTypeChanges(container.elementAction, writer.getElementType(), key + "[]", changes, visiting);
      } else {
        collectLogicalTypeChanges(container.elementAction, writer.getValueType(), key + "{}", changes, visiting);
      }
    }
    visiting.remove(action);
  }

  private static String typeKey(Schema schema) {
    return switch (schema.getType()) {
      case RECORD, ENUM, FIXED -> schema.getFullName();
      default -> schema.getType().getName();
    };
  }

  private static String describeLogicalType(Schema schema) {
    LogicalType logical = schema.getLogicalType();
    if (logical == null) {
      return "none";
    }
    if (logical instanceof LogicalTypes.Decimal decimal) {
      return "decimal(%d,%d)".formatted(decimal.getPrecision(), decimal.getScale());
    }
    return logical.getName();
  }

  private static List<Path> list(Path dir) {
    try (Stream<Path> entries = Files.list(dir)) {
      return entries.sorted().toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  /** The schemas break one or more rules; the message lists each problem on its own line. */
  public static final class InvalidSchemasException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final List<String> problems;

    InvalidSchemasException(List<String> problems) {
      super(String.join("\n", problems));
      this.problems = List.copyOf(problems);
    }

    public List<String> problems() {
      return problems;
    }
  }
}
