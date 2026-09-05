# Attachment security

Synthetic fixtures cover clean, malware, MIME/magic mismatch, hash mismatch, zero/
oversize content, timeout, scanner-unavailable, decompression-bound, unsafe filename,
bidi/control/path input, pending/failed/rejected access, and foreign-ticket access.
Object keys are server-generated; display filenames never influence keys, paths,
headers, content type, or authorization. Only a clean, owner-authorized object gets
a short download URL. No live malware sample or production object is used.
