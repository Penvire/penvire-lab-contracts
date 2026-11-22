// Validates event schema revisions and generates Java from the latest ones (ADR 0004 in
// penvire-lab-backend). Build tooling only; never published.
plugins {
    java
}

layout.buildDirectory = rootProject.layout.buildDirectory.dir("tools/avro")

dependencies {
    implementation(platform(libs.quarkus.bom))
    implementation("org.apache.avro:avro-compiler")

    testImplementation(platform(libs.quarkus.bom))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.release = 25
    options.encoding = "UTF-8"
}

tasks.test {
    useJUnitPlatform()
}
