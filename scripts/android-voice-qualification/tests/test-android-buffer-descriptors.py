"""Verify class Buffer signatures and ALL emitted DEX platform method signatures.

Javac's host Java17 ByteBuffer covariant signatures are absent on Android.
This reads public build artifacts only; it never loads Java code or uses a device.
"""
import argparse
import struct
from pathlib import Path
import zipfile

def class_data(data,details=False):
    if data[:4]!=b"\xca\xfe\xba\xbe":raise RuntimeError("CLASS_FORMAT")
    position=8
    def take(size):
        nonlocal position
        result=data[position:position+size];position+=size
        if len(result)!=size:raise RuntimeError("CLASS_FORMAT")
        return result
    def u2():return struct.unpack(">H",take(2))[0]
    count=u2();pool=[None]*count;index=1
    while index<count:
        tag=take(1)[0]
        if tag==1:pool[index]=(tag,take(u2()).decode("utf-8",errors="replace"))
        elif tag in (3,4):take(4)
        elif tag in (5,6):take(8);index+=1
        elif tag in (7,8,16,19,20):pool[index]=(tag,u2())
        elif tag in (9,10,11,12,17,18):pool[index]=(tag,u2(),u2())
        elif tag==15:take(3)
        else:raise RuntimeError("CLASS_FORMAT")
        index+=1
    def text(index):return pool[index][1]
    def owner(index):return text(pool[index][1])
    u2();u2();parent=u2();superclass=owner(parent) if parent else None
    interfaces=[owner(u2()) for _ in range(u2())]
    def members():
        result=set()
        for _ in range(u2()):
            access=u2();name=u2();descriptor=u2()
            if not details or access&5:result.add((text(name),text(descriptor)))
            for _ in range(u2()):u2();take(struct.unpack(">I",take(4))[0])
        return result
    members();methods=members();references=[]
    for item in pool:
        if item and item[0] in (10,11):
            named=pool[item[2]];references.append((owner(item[1]),text(named[1]),text(named[2])))
    return (superclass,interfaces,methods,references) if details else (superclass,methods,references)

class PlatformMethods:
    def __init__(self,archive):self.archive=archive;self.cache={}
    def contains(self,owner,name,descriptor,seen=None):
        seen=set() if seen is None else seen
        if owner in seen:return False
        seen.add(owner)
        if owner not in self.cache:
            try:self.cache[owner]=class_data(self.archive.read(owner+".class"),details=True)[:3]
            except KeyError:raise RuntimeError("ANDROID_PLATFORM_CLASS_UNAVAILABLE: "+owner)
        parent,interfaces,methods=self.cache[owner]
        if (name,descriptor) in methods:return True
        # Constructors belong to their exact declaring class, never a superclass/interface.
        if name in ("<init>","<clinit>"):return False
        return any(self.contains(base,name,descriptor,seen) for base in ([parent] if parent else [])+interfaces)

def platform_owner(owner):
    return owner.startswith(("java/","javax/","android/","org/xml/sax/","org/w3c/dom/"))

def verify_lookup_contract(methods):
    if not methods.contains("java/util/List","stream","()Ljava/util/stream/Stream;"):
        raise RuntimeError("INTERFACE_METHOD_LOOKUP_FAILED")
    if not methods.contains("java/lang/RuntimeException","<init>","(Ljava/lang/String;Ljava/lang/Throwable;ZZ)V"):
        raise RuntimeError("DECLARED_CONSTRUCTOR_LOOKUP_FAILED")
    if methods.contains("java/lang/IllegalStateException","<init>","(Ljava/lang/String;Ljava/lang/Throwable;ZZ)V"):
        raise RuntimeError("CONSTRUCTOR_INHERITANCE_ALLOWED")
    if methods.contains("java/nio/file/Files","readString","(Ljava/nio/file/Path;)Ljava/lang/String;"):
        raise RuntimeError("UNAVAILABLE_ANDROID_FILE_API_ACCEPTED")
    try:methods.contains("java/does/not/Exist","missing","()V")
    except RuntimeError as failure:
        if not str(failure).startswith("ANDROID_PLATFORM_CLASS_UNAVAILABLE:"):raise
    else:raise RuntimeError("MISSING_PLATFORM_CLASS_ACCEPTED")

def android_methods(jar,name):
    methods=set()
    with zipfile.ZipFile(jar) as archive:
        while name:
            name,declared,_=class_data(archive.read(name+".class"));methods.update(declared)
    return methods

def dex_references(data):
    if not data.startswith(b"dex\n"):raise RuntimeError("DEX_FORMAT")
    def u4(offset):return struct.unpack_from("<I",data,offset)[0]
    def u2(offset):return struct.unpack_from("<H",data,offset)[0]
    strings=[]
    for index in range(u4(56)):
        position=u4(u4(60)+index*4)
        while data[position]&128:position+=1
        position+=1;end=data.index(b"\0",position)
        strings.append(data[position:end].decode("utf-8",errors="replace"))
    types=[strings[u4(u4(68)+index*4)] for index in range(u4(64))]
    prototypes=[]
    for index in range(u4(72)):
        position=u4(76)+index*12;arguments=u4(position+8)
        names=[] if arguments==0 else [types[u2(arguments+4+offset*2)] for offset in range(u4(arguments))]
        prototypes.append("("+"".join(names)+")"+types[u4(position+4)])
    for index in range(u4(88)):
        position=u4(92)+index*8
        yield types[u2(position)],strings[u4(position+4)],prototypes[u2(position+2)]

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--android-jar",type=Path,required=True)
    parser.add_argument("--classes",type=Path)
    parser.add_argument("--dex",type=Path)
    args=parser.parse_args()
    if not (args.classes or args.dex):raise RuntimeError("COMPILED_ARTIFACT_REQUIRED")
    allowed={name:android_methods(args.android_jar,name) for name in ("java/nio/Buffer","java/nio/ByteBuffer")};checks=0
    references=[]
    if args.classes:
        for path in sorted(args.classes.rglob("*.class")):
            references.extend(ref for ref in class_data(path.read_bytes())[2] if ref[0] in allowed)
    if args.dex:
        references.extend((owner[1:-1],name,descriptor) for owner,name,descriptor in dex_references(args.dex.read_bytes()) if owner in ("Ljava/nio/Buffer;","Ljava/nio/ByteBuffer;"))
    for owner,name,descriptor in references:
        if (name,descriptor) not in allowed[owner]:raise RuntimeError("ANDROID_BUFFER_DESCRIPTOR_UNAVAILABLE: "+name+descriptor)
        checks+=1
    if checks==0:raise RuntimeError("BUFFER_CONTRACT_NOT_EXERCISED")
    print("PASS Android SDK class/DEX Buffer descriptor contract: "+str(checks)+" references")
    if args.dex:
        checks=0
        with zipfile.ZipFile(args.android_jar) as archive:
            methods=PlatformMethods(archive)
            verify_lookup_contract(methods)
            for owner,name,descriptor in dex_references(args.dex.read_bytes()):
                if not owner.startswith("L") or not platform_owner(owner[1:-1]):continue
                if not methods.contains(owner[1:-1],name,descriptor):
                    raise RuntimeError("ANDROID_PLATFORM_METHOD_UNAVAILABLE: "+owner+"."+name+descriptor)
                checks+=1
        if checks==0:raise RuntimeError("DEX_PLATFORM_CONTRACT_NOT_EXERCISED")
        print("PASS Android SDK DEX platform descriptor contract: "+str(checks)+" references")

if __name__=="__main__":main()
