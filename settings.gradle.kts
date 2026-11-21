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
