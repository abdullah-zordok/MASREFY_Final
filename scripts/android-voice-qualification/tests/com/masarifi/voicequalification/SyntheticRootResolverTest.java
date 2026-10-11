package com.masarifi.voicequalification;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/** Actual host path resolution under fresh synthetic parents; never Android data roots. */
public final class SyntheticRootResolverTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        Path fixture=Files.createTempDirectory("synthetic-package-root-").toRealPath();
        Path user0=fixture.resolve("user/0"),legacy=fixture.resolve("data");
        Files.createDirectories(user0);Files.createDirectory(legacy);
        Path userPackage=Files.createDirectory(user0.resolve(SyntheticRootResolver.TARGET));
        Path legacyPackage=Files.createDirectory(legacy.resolve(SyntheticRootResolver.TARGET));
        check(SyntheticRootResolver.canonicalRoot(userPackage,user0,legacy,SyntheticRootResolverTest::directory).equals(userPackage));
        check(SyntheticRootResolver.canonicalRoot(legacyPackage,user0,legacy,SyntheticRootResolverTest::directory).equals(legacyPackage));
        reject(() -> SyntheticRootResolver.canonicalRoot(legacyPackage,user0,legacy,path -> false));
        reject(() -> SyntheticRootResolver.canonicalRoot(fixture,user0,legacy,SyntheticRootResolverTest::directory));
        reject(() -> SyntheticRootResolver.canonicalRoot(userPackage.resolve(".."),user0,legacy,SyntheticRootResolverTest::directory));
        Path wrong=Files.createDirectory(legacy.resolve("com.other"));
        reject(() -> SyntheticRootResolver.canonicalRoot(wrong,user0,legacy,SyntheticRootResolverTest::directory));
        Path fileParents=Files.createDirectory(fixture.resolve("file-parents"));
        Path file=Files.writeString(fileParents.resolve(SyntheticRootResolver.TARGET),"public fixture");
        reject(() -> SyntheticRootResolver.canonicalRoot(file,fileParents,legacy,SyntheticRootResolverTest::directory));
        Path missingParent=Files.createDirectory(fixture.resolve("missing-parent"));
        reject(() -> SyntheticRootResolver.canonicalRoot(missingParent.resolve(SyntheticRootResolver.TARGET),missingParent,legacy,SyntheticRootResolverTest::directory));
        Path alias=fixture.resolve("system-user0-alias");
        try {Files.createSymbolicLink(alias,legacy);}
        catch(java.io.IOException|UnsupportedOperationException unavailable) {
            if(!System.getProperty("os.name").startsWith("Windows"))throw unavailable;
            System.out.println("UNEXECUTED_ROOT_CASE: Windows host cannot create symbolic links");
            System.out.println("PASS synthetic package root "+checks+" checks; synthetic roots retained");return;
        }
        check(SyntheticRootResolver.canonicalRoot(alias.resolve(SyntheticRootResolver.TARGET),alias,legacy,SyntheticRootResolverTest::directory).equals(legacyPackage));
        Path badParent=Files.createDirectory(fixture.resolve("package-symlink-parent"));
        Path packageLink=Files.createSymbolicLink(badParent.resolve(SyntheticRootResolver.TARGET),legacyPackage);
        reject(() -> SyntheticRootResolver.canonicalRoot(packageLink,badParent,legacy,SyntheticRootResolverTest::directory));
        Path unrelated=Files.createDirectory(fixture.resolve("unrelated"));Files.createDirectory(unrelated.resolve(SyntheticRootResolver.TARGET));
        Path badAlias=Files.createSymbolicLink(fixture.resolve("unrelated-system-alias"),unrelated);
        reject(() -> SyntheticRootResolver.canonicalRoot(badAlias.resolve(SyntheticRootResolver.TARGET),badAlias,legacy,SyntheticRootResolverTest::directory));
        System.out.println("PASS synthetic package root "+checks+" checks; synthetic roots retained");
    }
    private static boolean directory(Path path){return Files.isDirectory(path,LinkOption.NOFOLLOW_LINKS);}
    @FunctionalInterface private interface Action {void run() throws Exception;}
    private static void reject(Action action) throws Exception {
        try{action.run();throw new AssertionError("invalid package root accepted");}
        catch(IllegalStateException failure){check("SYNTHETIC_ROOT_INDETERMINATE".equals(failure.getMessage())&&failure.getCause()==null);}
    }
    private static void check(boolean value){if(!value)throw new AssertionError("root guard failed");checks++;}
}
