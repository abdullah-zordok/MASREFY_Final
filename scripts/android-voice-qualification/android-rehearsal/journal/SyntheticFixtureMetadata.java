package com.masarifi.voicequalification;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** Bounded public fixture JSON only; never included in the actual-target probe. */
final class SyntheticFixtureMetadata {
    static String read(Path path) throws IOException {
        long size=Files.size(path);
        if(size<=0 || size>8192)throw new IllegalStateException("FIXTURE_METADATA");
        byte[] bytes;
        // A hard byte limit also prevents an unstable file growing after the size check.
        try(var input=Files.newInputStream(path)) {bytes=input.readNBytes(8193);}
        try {
            if(bytes.length!=size || bytes.length>8192)throw new IllegalStateException("FIXTURE_METADATA");
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } finally {Arrays.fill(bytes,(byte)0);}
    }
}
