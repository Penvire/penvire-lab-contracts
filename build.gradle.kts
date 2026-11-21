import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

plugins {
    base
    alias(libs.plugins.openapi.generator) apply false
}

val serviceDocuments = fileTree("openapi") { include("*/openapi.yaml") }

val pnpmInstall by tasks.registering(Exec::class) {
    description = "Installs the Node contract tools."
    inputs.files("package.json", "pnpm-lock.yaml")
    outputs.dir("node_modules")
    commandLine("pnpm", "install", "--frozen-lockfile")
}

val lintContracts by tasks.registering(Exec::class) {
    description = "Lints every service document with Redocly and the Penvire rules."
    group = "verification"
    dependsOn(pnpmInstall)
    inputs.files(serviceDocuments, "openapi/scopes.yaml", "redocly.yaml", fileTree("generator/redocly"))
    outputs.upToDateWhen { true }
    commandLine(listOf("pnpm", "exec", "redocly", "lint") + serviceDocuments.files.sorted().map { it.relativeTo(projectDir).path })
}

val testContractTools by tasks.registering(Exec::class) {
    description = "Tests the lint rules and the breaking-change check."
    group = "verification"
    dependsOn(pnpmInstall)
    inputs.files(fileTree("generator"))
    outputs.upToDateWhen { true }
    commandLine("pnpm", "test")
}

tasks.check {
    dependsOn(lintContracts, testContractTools)
}

/** Reads info.version, which release-please maintains, from a service document. */
fun infoVersion(document: File): String =
    Regex("""(?m)^info:\s*\n(?:[ \t]+.*\n)*?[ \t]+version:\s*['"]?([0-9A-Za-z.+-]+)""")
        .find(document.readText())
        ?.groupValues
        ?.get(1)
        ?: error("$document has no info.version")

subprojects {
    apply(plugin = "java-library")

    val service = name.removeSuffix("-client")
    val document = file("openapi.yaml")
    val javaPackage = "dev.penvire.lab.${service.replace('-', '_')}.client"
    val generatedDir = layout.buildDirectory.dir("generated/openapi")

    group = "dev.penvire.lab"
    version = infoVersion(document)
    layout.buildDirectory = rootProject.layout.buildDirectory.dir("clients/$service")

    val generateClient by tasks.registering(GenerateTask::class) {
        description = "Generates the $service MicroProfile REST client."
        generatorName = "java"
        library = "microprofile"
        inputSpec = document
        outputDir = generatedDir
        apiPackage = "$javaPackage.api"
        modelPackage = "$javaPackage.model"
        invokerPackage = javaPackage
        cleanupOutput = true
        generateApiTests = false
        generateModelTests = false
        generateApiDocumentation = false
        generateModelDocumentation = false
        configOptions = mapOf(
            "microprofileRestClientVersion" to "3.0",
            "useJakartaEe" to "true",
            "serializationLibrary" to "jackson",
            "dateLibrary" to "java8",
            "hideGenerationTimestamp" to "true",
            "openApiNullable" to "false",
            // Tolerant readers: unknown fields and enum values must not break older clients.
            "disallowAdditionalPropertiesIfNotPresent" to "false",
            "enumUnknownDefaultCase" to "true",
            "additionalModelTypeAnnotations" to
                "@com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)",
            "configKey" to service,
            "sourceFolder" to "src/main/java",
        )
    }

    extensions.configure<JavaPluginExtension> {
        withSourcesJar()
        sourceSets.named("main") {
            java.srcDir(generateClient.map { generatedDir.get().dir("src/main/java") })
        }
    }

    tasks.withType<JavaCompile>().configureEach {
        options.release = 25
        options.encoding = "UTF-8"
    }

    tasks.withType<AbstractArchiveTask>().configureEach {
        isPreserveFileTimestamps = false
        isReproducibleFileOrder = true
    }

    dependencies {
        "api"(platform(rootProject.libs.quarkus.bom))
        "api"("org.eclipse.microprofile.rest.client:microprofile-rest-client-api")
        "api"("jakarta.ws.rs:jakarta.ws.rs-api")
        "api"("jakarta.annotation:jakarta.annotation-api")
        "api"("com.fasterxml.jackson.core:jackson-annotations")
        "api"("com.fasterxml.jackson.core:jackson-databind")
        "api"("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")
    }
}
