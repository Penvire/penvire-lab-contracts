pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        mavenCentral()
    }
}

rootProject.name = "penvire-lab-contracts"

// One Java client per service document: openapi/<service>/openapi.yaml becomes :<service>-client.
file("openapi")
    .listFiles { dir -> dir.resolve("openapi.yaml").isFile }
    .orEmpty()
    .sortedBy { it.name }
    .forEach { dir ->
        include(":${dir.name}-client")
        project(":${dir.name}-client").projectDir = dir
    }

// One event package per AsyncAPI document: asyncapi/<service>/asyncapi.yaml becomes :<service>-events.
file("asyncapi")
    .listFiles { dir -> dir.resolve("asyncapi.yaml").isFile }
    .orEmpty()
    .sortedBy { it.name }
    .forEach { dir ->
        include(":${dir.name}-events")
        project(":${dir.name}-events").projectDir = dir
    }

// Validates Avro schema revisions and generates the event classes; never published.
include(":avro-tools")
project(":avro-tools").projectDir = file("generator/avro")
