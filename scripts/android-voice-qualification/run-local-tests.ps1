param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path $PSScriptRoot 'src'
$testRoot = Join-Path $PSScriptRoot 'tests'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Use a new output directory; existing evidence is preserved.' }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$sources = @(Get-ChildItem -LiteralPath $testRoot -Recurse -Filter '*.java' | ForEach-Object FullName)
$sources += Join-Path $PSScriptRoot 'android-rehearsal/journal/SyntheticRootResolver.java'
if (Test-Path -LiteralPath $sourceRoot) {
    $sources += @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -Filter '*.java' | ForEach-Object FullName)
}
& javac -encoding UTF-8 -d $outputRoot @sources
if ($LASTEXITCODE -ne 0) { throw 'Portable reader compilation failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.VoiceStoreSnapshotTest
if ($LASTEXITCODE -ne 0) { throw 'Portable reader tests failed.' }
& java -Xmx96m -cp $outputRoot com.masarifi.voicequalification.VoiceStoreSnapshotHeapTest
if ($LASTEXITCODE -ne 0) { throw 'Bounded snapshot verification failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.CommittedWalSnapshotTest
if ($LASTEXITCODE -ne 0) { throw 'Committed WAL reconstruction failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.ExistingDatabaseKeyTest
if ($LASTEXITCODE -ne 0) { throw 'Existing-only key decryption failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.StrictJsonTest
if ($LASTEXITCODE -ne 0) { throw 'Bounded strict JSON parsing failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.SecureStoreKeyIndexTest
if ($LASTEXITCODE -ne 0) { throw 'Existing owner-key mapping failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.VoiceJournalClassifierTest
if ($LASTEXITCODE -ne 0) { throw 'Pinned Voice journal classification failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.NativeSnapshotReaderTest
if ($LASTEXITCODE -ne 0) { throw 'Strict JNI row boundary failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.PrivateProbePolicyTest
if ($LASTEXITCODE -ne 0) { throw 'Real-target private probe guard failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.PrivateProbeRootTest
if ($LASTEXITCODE -ne 0) { throw 'Real-target private probe path resolution failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.SyntheticRootResolverTest
if ($LASTEXITCODE -ne 0) { throw 'Synthetic package path resolution failed.' }
& python "$testRoot/test-probe-build.py"
if ($LASTEXITCODE -ne 0) { throw 'Offline real-target probe packaging gate failed.' }
& python "$testRoot/test-bootstrap-observations.py"
if ($LASTEXITCODE -ne 0) { throw 'Exact synthetic startup control accounting failed.' }
& python "$testRoot/schema-fixtures.py" --output "$outputRoot/schema-fixtures" --classes $outputRoot
if ($LASTEXITCODE -ne 0) { throw 'Complete database schema recognition failed.' }
& java -cp $outputRoot com.masarifi.voicequalification.VoiceStoreQualificationTest "$outputRoot/schema-fixtures"
if ($LASTEXITCODE -ne 0) { throw 'Complete-store journal binding failed.' }
& python "$testRoot/real-wal-fixtures.py" --classes $outputRoot
if ($LASTEXITCODE -ne 0) { throw 'Disposable SQLite WAL fixture failed.' }
