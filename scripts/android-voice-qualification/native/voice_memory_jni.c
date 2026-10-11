#include "voice_memory_reader.h"
#include <jni.h>
#include <stdlib.h>
#include <string.h>

static void clear_bytes(void *bytes,size_t length) {volatile unsigned char *at=bytes;while(length--)*at++=0;}
static void failure(JNIEnv *env) {
    if((*env)->ExceptionCheck(env))(*env)->ExceptionClear(env);
    jclass type=(*env)->FindClass(env,"java/lang/IllegalStateException");
    if(type)(*env)->ThrowNew(env,type,"SNAPSHOT_NATIVE");
}
JNIEXPORT jlong JNICALL Java_com_masarifi_voicequalification_NativeSnapshotReader_nOpen
        (JNIEnv *env,jclass type,jbyteArray database,jbyteArray key) {
    (void)type;
    if(!database){failure(env);return 0;}
    jsize length=(*env)->GetArrayLength(env,database),key_length=key?(*env)->GetArrayLength(env,key):0;
    if(length<512 || length>64*1024*1024 || (key && key_length!=32)){failure(env);return 0;}
    unsigned char *bytes=malloc((size_t)length),key_bytes[32]={0};
    if(!bytes){failure(env);return 0;}
    (*env)->GetByteArrayRegion(env,database,0,length,(jbyte *)bytes);
    if(key)(*env)->GetByteArrayRegion(env,key,0,key_length,(jbyte *)key_bytes);
    VqsReader *reader=NULL;
    int status=VQS_INPUT;
    if(!(*env)->ExceptionCheck(env)) {
        VqsInput input={bytes,(size_t)length,key?key_bytes:NULL,(size_t)key_length};
        status=vqs_open(&input,&reader);
    }
    clear_bytes(bytes,(size_t)length);free(bytes);clear_bytes(key_bytes,sizeof(key_bytes));
    if(status || !reader){failure(env);return 0;}
    return (jlong)(intptr_t)reader;
}
typedef struct {JNIEnv *env;jobject sink;jmethodID accept;} Delivery;
static int receive(void *opaque,const VqsRow *row) {
    Delivery *delivery=opaque;JNIEnv *env=delivery->env;
    if(row->count<1 || row->count>4 || (*env)->PushLocalFrame(env,16)<0)return 1;
    jint kinds[4]={0};jlong integers[4]={0};jbyteArray columns[4]={NULL};
    jclass array_class=(*env)->FindClass(env,"[B");
    jintArray kind_array=(*env)->NewIntArray(env,(jsize)row->count);
    jlongArray integer_array=(*env)->NewLongArray(env,(jsize)row->count);
    jobjectArray texts=array_class?(*env)->NewObjectArray(env,(jsize)row->count,array_class,NULL):NULL;
    int status=1;
    if(!kind_array || !integer_array || !texts || (*env)->ExceptionCheck(env))goto done;
    for(size_t index=0;index<row->count;index++) {
        kinds[index]=row->cells[index].kind;integers[index]=(jlong)row->cells[index].integer;
        if(kinds[index]!=1 && kinds[index]!=3 && kinds[index]!=5)goto done;
        if(kinds[index]==3) {
            if(row->cells[index].length>98304)goto done;
            columns[index]=(*env)->NewByteArray(env,(jsize)row->cells[index].length);
            if(!columns[index] || (*env)->ExceptionCheck(env))goto done;
            (*env)->SetByteArrayRegion(env,columns[index],0,(jsize)row->cells[index].length,(const jbyte *)row->cells[index].text);
            (*env)->SetObjectArrayElement(env,texts,(jsize)index,columns[index]);
            if((*env)->ExceptionCheck(env))goto done;
        }
    }
    (*env)->SetIntArrayRegion(env,kind_array,0,(jsize)row->count,kinds);
    (*env)->SetLongArrayRegion(env,integer_array,0,(jsize)row->count,integers);
    if((*env)->ExceptionCheck(env))goto done;
    (*env)->CallVoidMethod(env,delivery->sink,delivery->accept,kind_array,integer_array,texts);
    status=(*env)->ExceptionCheck(env)?1:0;
done:
    // Discard any private callback exception; callers get one fixed code only.
    if((*env)->ExceptionCheck(env))(*env)->ExceptionClear(env);
    for(size_t index=0;index<row->count;index++)if(columns[index] && row->cells[index].length) {
        size_t length=row->cells[index].length;
        unsigned char *zeros=calloc(length,1);
        if(zeros) {(*env)->SetByteArrayRegion(env,columns[index],0,(jsize)length,(const jbyte *)zeros);free(zeros);}
        else status=1;
        if((*env)->ExceptionCheck(env)){(*env)->ExceptionClear(env);status=1;}
    }
    (*env)->PopLocalFrame(env,NULL);
    return status;
}
JNIEXPORT jint JNICALL Java_com_masarifi_voicequalification_NativeSnapshotReader_nVisit
        (JNIEnv *env,jobject sink,jlong handle,jint query) {
    if(!handle || query<VQS_SCHEMA || query>VQS_MARKER)return VQS_INPUT;
    jclass type=(*env)->GetObjectClass(env,sink);
    jmethodID accept=type?(*env)->GetMethodID(env,type,"accept","([I[J[[B)V"):NULL;
    if(!accept || (*env)->ExceptionCheck(env)){if((*env)->ExceptionCheck(env))(*env)->ExceptionClear(env);return VQS_VISITOR;}
    Delivery delivery={env,sink,accept};
    int status=vqs_visit((VqsReader *)(intptr_t)handle,(enum VqsQuery)query,receive,&delivery);
    if((*env)->ExceptionCheck(env)){(*env)->ExceptionClear(env);return VQS_VISITOR;}
    return status;
}
JNIEXPORT jint JNICALL Java_com_masarifi_voicequalification_NativeSnapshotReader_nClose
        (JNIEnv *env,jclass type,jlong handle) {
    (void)env;(void)type;
    return handle?vqs_close((VqsReader *)(intptr_t)handle):VQS_INPUT;
}
