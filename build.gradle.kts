import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

plugins {
    base
    `maven-publish`
    alias(libs.plugins.openapi.generator) apply false
}

/** The Forgejo Maven registry; forgejoUsername / forgejoPassword come from ORG_GRADLE_PROJECT_* in CI. */
fun RepositoryHandler.forgejo(project: Project) = maven {
    name = "forgejo"
    url = project.uri(project.providers.gradleProperty("forgejoMavenUrl").get())
    if (url.scheme == "https") credentials(PasswordCredentials::class)
}

val serviceDocuments = fileTree("openapi") { include("*/openapi.yaml") }

val pnpmInstall by tasks.registering(Exec::class) {
    description = "Installs the Node contract tools."
    inputs.files("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml")
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

val eventDocuments = fileTree("asyncapi") { include("*/asyncapi.yaml", "*/avro/**") }

val lintEvents by tasks.registering(Exec::class) {
    description = "Validates every AsyncAPI document and checks the Penvire event rules."
    group = "verification"
    dependsOn(pnpmInstall)
    inputs.files(eventDocuments, fileTree("asyncapi") { include("*/generator.sha256") }, fileTree("generator/asyncapi"), fileTree("generator/avro/src/main"), "generator/avro/build.gradle.kts")
    outputs.upToDateWhen { true }
    commandLine("node", "generator/asyncapi/lint.mjs")
}

val testContractTools by tasks.registering(Exec::class) {
    description = "Tests the lint rules and the breaking-change check."
    group = "verification"
    dependsOn(pnpmInstall)
    inputs.files(fileTree("generator"))
    outputs.upToDateWhen { true }
    commandLine("pnpm", "test")
}

val publicApiDir = layout.buildDirectory.dir("public-api")

val buildPublicApi by tasks.registering(Exec::class) {
    description = "Merges every api and protocol operation into build/public-api/public-api.yaml (-PpublicApiSource=head|released)."
    group = "build"
    dependsOn(pnpmInstall)
    inputs.files(serviceDocuments, fileTree("generator"))
    outputs.upToDateWhen { false }
    commandLine("node", "generator/public-api/build.mjs", providers.gradleProperty("publicApiSource").getOrElse("head"))
}

val generateApiClient by tasks.registering(GenerateTask::class) {
    description = "Generates the @penvire-lab/api-client sources from client.yaml: api operations, every schema."
    dependsOn(buildPublicApi)
    generatorName = "typescript-fetch"
    inputSpec = publicApiDir.map { it.file("client.yaml") }
    outputDir = publicApiDir.map { it.dir("ts") }
    cleanupOutput = true
    configOptions = mapOf(
        "npmName" to "@penvire-lab/api-client",
        "supportsES6" to "true",
        // Explicit .js imports so the compiled ESM runs in Node as well as in bundlers.
        "importFileExtension" to ".js",
        "hideGenerationTimestamp" to "true",
    )
}

val packageApiClient by tasks.registering(Exec::class) {
    description = "Compiles and packs @penvire-lab/api-client into build/public-api/npm (-PpublicApiVersion=…)."
    group = "build"
    dependsOn(generateApiClient)
    outputs.upToDateWhen { false }
    commandLine("node", "generator/public-api/package-client.mjs", providers.gradleProperty("publicApiVersion").getOrElse("0.0.0"))
}

tasks.check {
    dependsOn(lintContracts, lintEvents, testContractTools, packageApiClient)
}

// Uploads an already built and versioned public-api.yaml; the release workflow builds it first.
publishing {
    publications {
        create<MavenPublication>("publicApi") {
            groupId = "dev.penvire.lab"
            artifactId = "public-api"
            version = providers.gradleProperty("publicApiVersion").getOrElse("0.0.0")
            artifact(publicApiDir.map { it.file("public-api.yaml") }) { extension = "yaml" }
            pom {
                name = "Penvire Lab public API"
                description = "Every api and protocol operation of every released Penvire Lab service, merged."
                licenses { license { name = "Apache-2.0"; url = "https://www.apache.org/licenses/LICENSE-2.0" } }
            }
        }
    }
    repositories { forgejo(project) }
}

/** Reads info.version, which release-please maintains, from an OpenAPI or AsyncAPI document. */
fun infoVersion(document: File): String =
    Regex("""(?m)^info:\s*\n(?:[ \t]+.*\n)*?[ \t]+version:\s*['"]?([0-9A-Za-z.+-]+)""")
        .find(document.readText())
        ?.groupValues
        ?.get(1)
        ?: error("$document has no info.version")

configure(subprojects.filter { it.name.endsWith("-client") }) {
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

    // One self-contained file for the service's own server generation; Redocly inlines external refs.
    val bundleContract by tasks.registering(Exec::class) {
        description = "Bundles the $service document into a single file."
        dependsOn(":pnpmInstall")
        val bundled = layout.buildDirectory.file("contract/$service-openapi.yaml").get().asFile
        inputs.file(document)
        outputs.file(bundled)
        workingDir = rootDir
        commandLine("pnpm", "exec", "redocly", "bundle", document.relativeTo(rootDir).path, "--output", bundled.path)
    }

    apply(plugin = "maven-publish")
    extensions.configure<PublishingExtension> {
        publications {
            create<MavenPublication>("client") {
                artifactId = project.name
                from(components["java"])
                pom {
                    name = "Penvire Lab $service client"
                    description = "MicroProfile REST client for the Penvire Lab $service service."
                    licenses { license { name = "Apache-2.0"; url = "https://www.apache.org/licenses/LICENSE-2.0" } }
                }
            }
            create<MavenPublication>("contract") {
                artifactId = "$service-openapi"
                artifact(bundleContract.map { it.outputs.files.singleFile }) { extension = "yaml" }
                pom {
                    name = "Penvire Lab $service contract"
                    description = "Bundled OpenAPI document of the Penvire Lab $service service."
                    licenses { license { name = "Apache-2.0"; url = "https://www.apache.org/licenses/LICENSE-2.0" } }
                }
            }
        }
        repositories { forgejo(project) }
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

// One event package per AsyncAPI document: Java classes for the latest revision of each schema,
// plus every revision as avro/<full name>/<revision>.avsc, which consumers find by ce_dataschema
// (ADR 0004 in penvire-lab-backend).
configure(subprojects.filter { it.name.endsWith("-events") }) {
    apply(plugin = "java-library")
    apply(plugin = "maven-publish")

    val service = name.removeSuffix("-events")
    val avroDir = file("avro")
    val generatedDir = layout.buildDirectory.dir("generated/avro")

    group = "dev.penvire.lab"
    version = infoVersion(file("asyncapi.yaml"))
    layout.buildDirectory = rootProject.layout.buildDirectory.dir("events/$service")

    val avroTool = configurations.create("avroTool")
    dependencies { avroTool(project(":avro-tools")) }

    val generateEvents = tasks.register<JavaExec>("generateEvents") {
        description = "Checks the $service schema revisions and generates Java for the latest ones."
        classpath = avroTool
        mainClass = "dev.penvire.lab.avro.SchemaTool"
        inputs.dir(avroDir)
        outputs.dir(generatedDir)
        args("generate", avroDir.path, service, generatedDir.get().asFile.path)
    }

    extensions.configure<JavaPluginExtension> {
        withSourcesJar()
        sourceSets.named("main") {
            java.srcDir(generateEvents)
            resources.srcDir(layout.projectDirectory).include("avro/**/*.avsc")
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

    extensions.configure<PublishingExtension> {
        publications {
            create<MavenPublication>("events") {
                artifactId = project.name
                from(components["java"])
                pom {
                    name = "Penvire Lab $service events"
                    description = "Avro event classes and every schema revision of the Penvire Lab $service service."
                    licenses { license { name = "Apache-2.0"; url = "https://www.apache.org/licenses/LICENSE-2.0" } }
                }
            }
        }
        repositories { forgejo(project) }
    }

    dependencies {
        "api"(platform(rootProject.libs.quarkus.bom))
        "api"("org.apache.avro:avro")
    }
}
