package dev.penvire.lab.avro;

import dev.penvire.lab.avro.SchemaRevisions.InvalidSchemasException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.apache.avro.compiler.specific.SpecificCompiler;
import org.apache.avro.generic.GenericData;

/**
 * Command line for the Gradle build.
 *
 * <pre>
 *   check    &lt;avro dir&gt; &lt;service&gt;               validate every revision
 *   generate &lt;avro dir&gt; &lt;service&gt; &lt;output dir&gt;  validate, then write Java for the latest revisions
 * </pre>
 */
public final class SchemaTool {

  private SchemaTool() {}

  public static void main(String[] args) throws IOException {
    boolean check = args.length == 3 && args[0].equals("check");
    boolean generate = args.length == 4 && args[0].equals("generate");
    if (!check && !generate) {
      usage();
      return;
    }
    List<SchemaRevisions> schemas;
    try {
      schemas = SchemaRevisions.load(Path.of(args[1]), args[2]);
    } catch (InvalidSchemasException e) {
      System.err.println("Invalid event schemas in " + args[1] + ":");
      e.problems().forEach(problem -> System.err.println("  - " + problem));
      System.exit(1);
      return;
    }
    if (generate) {
      generate(schemas, Path.of(args[3]));
    }
    System.out.println("Checked " + schemas.size() + " event schema(s) in " + args[1] + ".");
  }

  static void generate(List<SchemaRevisions> schemas, Path outputDir) throws IOException {
    deleteRecursively(outputDir);
    Files.createDirectories(outputDir);
    for (SchemaRevisions schema : schemas) {
      SpecificCompiler compiler = new SpecificCompiler(schema.latest());
      compiler.setStringType(GenericData.StringType.String);
      compiler.setOutputCharacterEncoding("UTF-8");
      compiler.compileToDestination(null, outputDir.toFile());
    }
  }

  private static void deleteRecursively(Path dir) throws IOException {
    if (!Files.exists(dir)) {
      return;
    }
    try (Stream<Path> paths = Files.walk(dir)) {
      for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
        Files.delete(path);
      }
    }
  }

  private static void usage() {
    System.err.println(
        "usage: check <avro dir> <service> | generate <avro dir> <service> <output dir>");
    System.exit(2);
  }
}
