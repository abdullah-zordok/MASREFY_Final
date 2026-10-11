package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/** Actual host path resolution under fresh synthetic parents; never Android data roots. */
public final class PrivateProbeRootTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        Path fixture=Files.createTempDirectory("private-probe-root-").toRealPath();
        Path user0=fixture.resolve("user/0"),legacy=fixture.resolve("data");
        Files.createDirectories(user0);Files.createDirectory(legacy);
        Path userPackage=Files.createDirectory(user0.resolve(PrivateProbePolicy.TARGET));
        Path legacyPackage=Files.createDirectory(legacy.resolve(PrivateProbePolicy.TARGET));
        check(PrivateProbePolicy.canonicalRoot(userPackage,user0,legacy,PrivateProbeRootTest::directory).equals(userPackage));
        check(PrivateProbePolicy.canonicalRoot(legacyPackage,user0,legacy,PrivateProbeRootTest::directory).equals(legacyPackage));
        reject(() -> PrivateProbePolicy.canonicalRoot(legacyPackage,user0,legacy,path -> false));
        reject(() -> PrivateProbePolicy.canonicalRoot(fixture,user0,legacy,PrivateProbeRootTest::directory));
        reject(() -> PrivateProbePolicy.canonicalRoot(userPackage.resolve(".."),user0,legacy,PrivateProbeRootTest::directory));
        Path wrong=Files.createDirectory(legacy.resolve("com.other"));
        reject(() -> PrivateProbePolicy.canonicalRoot(wrong,user0,legacy,PrivateProbeRootTest::directory));
        Path fileParents=Files.createDirectory(fixture.resolve("file-parents"));
        Path file=Files.writeString(fileParents.resolve(PrivateProbePolicy.TARGET),"public fixture");
        reject(() -> PrivateProbePolicy.canonicalRoot(file,fileParents,legacy,PrivateProbeRootTest::directory));
        Path missingParent=Files.createDirectory(fixture.resolve("missing-parent"));
        reject(() -> PrivateProbePolicy.canonicalRoot(missingParent.resolve(PrivateProbePolicy.TARGET),missingParent,legacy,PrivateProbeRootTest::directory));
        Path alias=fixture.resolve("system-user0-alias");
        try {Files.createSymbolicLink(alias,legacy);}
        catch(java.io.IOException|UnsupportedOperationException unavailable) {
            if(!System.getProperty("os.name").startsWith("Windows"))throw unavailable;
            System.out.println("UNEXECUTED_ROOT_CASE: Windows host cannot create symbolic links");
            System.out.println("PASS private probe root "+checks+" checks; synthetic roots retained");return;
        }
        check(PrivateProbePolicy.canonicalRoot(alias.resolve(PrivateProbePolicy.TARGET),alias,legacy,PrivateProbeRootTest::directory).equals(legacyPackage));
        Path badParent=Files.createDirectory(fixture.resolve("package-symlink-parent"));
        Path packageLink=Files.createSymbolicLink(badParent.resolve(PrivateProbePolicy.TARGET),legacyPackage);
        reject(() -> PrivateProbePolicy.canonicalRoot(packageLink,badParent,legacy,PrivateProbeRootTest::directory));
        Path unrelated=Files.createDirectory(fixture.resolve("unrelated"));Files.createDirectory(unrelated.resolve(PrivateProbePolicy.TARGET));
        Path badAlias=Files.createSymbolicLink(fixture.resolve("unrelated-system-alias"),unrelated);
        reject(() -> PrivateProbePolicy.canonicalRoot(badAlias.resolve(PrivateProbePolicy.TARGET),badAlias,legacy,PrivateProbeRootTest::directory));
        System.out.println("PASS private probe root "+checks+" checks; synthetic roots retained");
    }
    private static boolean directory(Path path){return Files.isDirectory(path,LinkOption.NOFOLLOW_LINKS);}
    @FunctionalInterface private interface Action {void run() throws Exception;}
    private static void reject(Action action) throws Exception {
        try{action.run();throw new AssertionError("invalid package root accepted");}
        catch(IllegalStateException failure){check("PROBE_IDENTITY_INDETERMINATE".equals(failure.getMessage())&&failure.getCause()==null);}
    }
    private static void check(boolean value){if(!value)throw new AssertionError("root guard failed");checks++;}
}
