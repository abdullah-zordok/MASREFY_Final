"""Pure bounded host parser. No device commands or raw-output retention."""
import math, re

STAGES = frozenset('TARGET_METADATA PROBE_METADATA TARGET_DECLARATION TARGET_APK TARGET_CERTIFICATE PROBE_CERTIFICATE DATA_ROOT IDENTITY_POLICY PROCESS_SURVEY APPLICATION_CLASS UNEXPECTED'.split())
STAGES = STAGES | frozenset('PROCESS_SERVICE_UNAVAILABLE PROCESS_LIST_UNAVAILABLE PROCESS_RECORD_INVALID PROCESS_SAME_UID_PEER PROCESS_NAME_MISMATCH PROCESS_SELF_MISSING PROCESS_SELF_DUPLICATE PROCESS_SURVEY_EXCEPTION'.split())
COUNTS = frozenset('owners legacy async rows pending terminal audioOwned confirmationOwned committedFrames targetUid'.split())
BOOLEANS = frozenset('unchanged plainApplication onlyPrivateProcess'.split())
HASHES = frozenset('fingerprint targetApkSha256 probeApkSha256 certificateSha256'.split())
READER_STAGES = frozenset('CONTEXT OBSERVED_BINDING MAIN_LOOP_BARRIER PLAIN_APPLICATION IDENTITY_BEFORE PROCESS_BEFORE DATA_ROOT INITIAL_STAMPS NATIVE_LOAD SNAPSHOT_CAPTURE NATIVE_FILE_IDENTITY SNAPSHOT_STAMPS PROCESS_BEFORE_QUALIFICATION QUALIFICATION SNAPSHOT_UNCHANGED FILE_STAMPS_UNCHANGED DIRECTORY_STAMPS_UNCHANGED IDENTITY_AFTER PROCESS_AFTER RECEIPT_BUILD SNAPSHOT_CLOSE FINISH UNEXPECTED'.split())
FIELDS = COUNTS | BOOLEANS | HASHES | {'verdict'}
PEER_ROLES = frozenset('TARGET_MAIN PRIVATE_PROCESS_NAME TARGET_AUXILIARY OTHER UNKNOWN_NAME INVALID_PID'.split())

def decode_marker(text):
    match=re.fullmatch(r'PROBE_IDENTITY_INDETERMINATE:([A-Z_]+)(?::PEER_ROLE=([A-Z_]+))?',text)
    if not match or match[1] not in STAGES:return None
    if match[2] is not None and (match[1]!='PROCESS_SAME_UID_PEER' or match[2] not in PEER_ROLES):return None
    return match[1],match[2]

def indeterminate(category, stage=None, peer_role=None):
    result = {'verdict': 'INDETERMINATE', 'failureCategory': category}
    if stage in STAGES:
        result['bootstrapStage'] = stage
        if stage=='PROCESS_SAME_UID_PEER' and peer_role in PEER_ROLES:result['peerRole']=peer_role
    return result

def device_clock_alignment(output,start,end):
    if (not isinstance(output,str) or re.fullmatch(r'[1-9][0-9]{0,10}\s*',output) is None or
        not math.isfinite(start) or not math.isfinite(end) or not 0<=end-start<=2):return None
    # `date +%s` represents any time within this one-second interval.
    lower=int(output)-end;upper=int(output)+1-start
    return (lower,upper) if lower>=-2 and upper<=2 else None

def parse_crash_metadata(output, start, end):
    """Correlate closed stages by time and crash PID; identifiers stay in RAM."""
    result={'bootstrapStage':None,'dedicatedCrashProcessObserved':False,
            'recognizedWindowRecords':0,'rawLogRetained':False,'journalVerdict':'INDETERMINATE'}
    if (not isinstance(output,str) or len(output.encode('utf-8'))>262144 or
        not math.isfinite(start) or not math.isfinite(end) or end<start):
        return result
    process_ids=set();observations=[];invalid=False
    for line in output.splitlines():
        if not line.strip() or line.startswith('--------- beginning of '):continue
        record=re.fullmatch(r'\s*([0-9]+\.[0-9]+)\s+([0-9]+)\s+([0-9]+)\s+E\s+AndroidRuntime\s*:\s*(.*)',line)
        if not record:
            invalid=True;continue
        timestamp=float(record[1])
        if not start<=timestamp<=end:continue
        result['recognizedWindowRecords']+=1
        process=re.fullmatch(r'Process: com\.masarifi\.mobile:voicequalify, PID: ([1-9][0-9]*)\s*',record[4])
        if process and int(record[2])==int(process[1]):process_ids.add(int(record[2]))
        marker=re.search(r'(PROBE_IDENTITY_INDETERMINATE:.*)\s*$',record[4])
        if marker:
            decoded=decode_marker(marker[1].rstrip())
            if decoded is not None:observations.append((int(record[2]),decoded))
            else:invalid=True
    result['dedicatedCrashProcessObserved']=len(process_ids)==1
    if not invalid and len(process_ids)==1:
        markers={decoded for pid,decoded in observations if pid in process_ids}
        if len(markers)==1:
            stage,role=next(iter(markers));result['bootstrapStage']=stage
            if role is not None:result['peerRole']=role
    return result

def parse(output, exit_code, expected):
    if not isinstance(output, str) or len(output.encode('utf-8')) > 65536:
        return indeterminate('OUTPUT_BOUND_EXCEEDED')
    values = {}
    codes = []
    malformed = False
    for line in output.splitlines():
        if line.startswith('INSTRUMENTATION_RESULT:'):
            match = re.fullmatch(r'INSTRUMENTATION_RESULT: ([A-Za-z][A-Za-z0-9]*)=(.*)', line)
            if not match or match[1] in values:
                malformed = True
            else:
                values[match[1]] = match[2]
        elif line.startswith('INSTRUMENTATION_CODE:'):
            match = re.fullmatch(r'INSTRUMENTATION_CODE: (-?\d+)', line)
            if not match:
                malformed = True
            else:
                codes.append(match[1])
        elif line.strip():
            # Multiline exception continuations and unknown framework records
            # cannot become successful receipts or partly trusted stage values.
            malformed = True
    # A framework failure is never a journal classification. Retain a fixed stage
    # only when it is the entire expected diagnostic exception, with no free text.
    short_message = values.get('shortMsg', '')
    stage_match = re.fullmatch(r'(?:java\.lang\.ClassNotFoundException: )?(PROBE_IDENTITY_INDETERMINATE:.*)', short_message)
    decoded = decode_marker(stage_match[1]) if stage_match else None
    stage,role = decoded if decoded is not None else (None,None)
    if malformed or len(codes) != 1:
        return indeterminate('INVALID_ENVELOPE')
    if exit_code != 0 or codes[0] not in ('-1', '0'):
        return indeterminate('EXECUTION_FAILED', stage, role)
    if 'shortMsg' in values:
        return indeterminate('FRAMEWORK_BOOTSTRAP_FAILED', stage, role)
    if (set(values) == {'verdict', 'readerStage'} and values['verdict'] == 'INDETERMINATE'
            and values['readerStage'] in READER_STAGES and codes[0] == '0'):
        return {**indeterminate('READER_INDETERMINATE'), 'readerStage': values['readerStage']}
    if values == {'verdict': 'INDETERMINATE'} and codes[0] == '0':
        return indeterminate('READER_INDETERMINATE')
    if set(values) != FIELDS or codes[0] != '-1' or values['verdict'] not in ('CLEAR', 'BLOCKED'):
        return indeterminate('INCOMPLETE_RECEIPT')
    typed = dict(values)
    for key in COUNTS:
        if not re.fullmatch(r'0|[1-9][0-9]{0,9}', values[key]) or int(values[key]) > 2147483647:
            return indeterminate('INVALID_COUNT')
        typed[key] = int(values[key])
    for key in BOOLEANS:
        if values[key] != 'true':
            return indeterminate('UNCHANGED_PROOF_MISSING')
        typed[key] = True
    for key in HASHES:
        if not re.fullmatch(r'[0-9a-f]{64}', values[key]):
            return indeterminate('INVALID_HASH')
    if any(typed[key] != expected[key] for key in ('targetUid', 'targetApkSha256', 'probeApkSha256', 'certificateSha256')):
        return indeterminate('IDENTITY_CHANGED')
    no_work = typed['pending'] + typed['audioOwned'] + typed['confirmationOwned'] == 0
    if (typed['verdict'] == 'CLEAR') != no_work:
        return indeterminate('INCONSISTENT_VERDICT')
    return typed
