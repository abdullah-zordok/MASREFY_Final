package com.masarifi.voicequalification;

import java.nio.file.Path;

/** Public synthetic package only; never included in the real-target diagnostic APK. */
final class SyntheticRootResolver {
    static final String TARGET="com.masarifi.voicequalification.fixture";
    @FunctionalInterface interface DirectoryCheck {boolean ownedDirectory(Path path) throws Exception;}
    static Path canonicalRoot(Path declared,Path user0Parent,Path legacyParent,DirectoryCheck check) {
        try {
            if(declared==null || user0Parent==null || legacyParent==null || check==null)throw failure();
            Path user=user0Parent.resolve(TARGET),legacy=legacyParent.resolve(TARGET);
            if(!declared.isAbsolute() || !declared.equals(declared.normalize()) ||
                    (!declared.equals(user)&&!declared.equals(legacy)) || !check.ownedDirectory(declared))throw failure();
            Path canonical=declared.toRealPath();
            if((!canonical.equals(user)&&!canonical.equals(legacy)) || !check.ownedDirectory(canonical))throw failure();
            return canonical;
        } catch(Exception rejected){throw failure();}
    }
    private static IllegalStateException failure(){return new IllegalStateException("SYNTHETIC_ROOT_INDETERMINATE");}
}
