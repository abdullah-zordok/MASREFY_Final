"""Verify compiled class AND DEX method signatures against the supplied Android SDK.

Javac's host Java17 ByteBuffer covariant signatures are absent on Android.
This reads public build artifacts only; it never loads Java code or uses a device.
"""
import argparse
import struct
from pathlib import Path
import zipfile

def class_data(data):
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
    for _ in range(u2()):u2()
    def members():
        result=set()
        for _ in range(u2()):
            u2();name=u2();descriptor=u2();result.add((text(name),text(descriptor)))
            for _ in range(u2()):u2();take(struct.unpack(">I",take(4))[0])
        return result
    members();methods=members();references=[]
    for item in pool:
        if item and item[0] in (10,11):
            named=pool[item[2]];references.append((owner(item[1]),text(named[1]),text(named[2])))
    return superclass,methods,references

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
    print("PASS Android SDK class/DEX ByteBuffer descriptor contract: "+str(checks)+" references")

if __name__=="__main__":main()
