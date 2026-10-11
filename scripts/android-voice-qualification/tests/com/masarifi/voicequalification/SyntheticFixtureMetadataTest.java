package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;

/** Public fixture metadata contract only; no Android or application data. */
public final class SyntheticFixtureMetadataTest {
    public static void main(String[] args) throws Exception {
        Path root=Files.createTempDirectory("synthetic-metadata-");
        Path good=Files.write(root.resolve("good.json"),"{\"verdict\":\"EMPTY\",\"label\":\"ع\"}".getBytes(StandardCharsets.UTF_8));
        check(SyntheticFixtureMetadata.read(good).equals("{\"verdict\":\"EMPTY\",\"label\":\"ع\"}"));
        reject(Files.write(root.resolve("bad-utf8.json"),new byte[]{(byte)0xc3,0x28}));
        reject(Files.write(root.resolve("empty.json"),new byte[0]));
        reject(Files.write(root.resolve("oversized.json"),new byte[8193]));
        reject(root.resolve("missing.json"));
        Path limit=Files.write(root.resolve("limit.json")," ".repeat(8192).getBytes(StandardCharsets.UTF_8));
        check(SyntheticFixtureMetadata.read(limit).length()==8192);
        System.out.println("PASS bounded strict UTF8 synthetic metadata 6 checks; fixtures retained");
    }
    private static void reject(Path path) throws Exception {
        try {SyntheticFixtureMetadata.read(path);throw new AssertionError("invalid metadata accepted");}
        catch(java.io.IOException|IllegalStateException expected) {}
    }
    private static void check(boolean value){if(!value)throw new AssertionError("metadata mismatch");}
}
