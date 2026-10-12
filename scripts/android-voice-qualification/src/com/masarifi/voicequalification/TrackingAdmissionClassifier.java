package com.masarifi.voicequalification;

import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Pure bounded observation, not launch authorization. Null means caller-verified absence. */
public final class TrackingAdmissionClassifier {
    private TrackingAdmissionClassifier() {}

    public static String sourceState(String value) {
        if (value == null) return "INACTIVE";
        try {
            Object parsed = StrictJson.parse(value);
            if (!(parsed instanceof Map<?, ?> map) ||
                    !Set.of("smsEnabled", "notificationEnabled").containsAll(map.keySet())) return "UNKNOWN";
            return flags(map, "smsEnabled", "notificationEnabled");
        } catch (RuntimeException invalid) { return "UNKNOWN"; }
    }

    public static String nativeState(byte[] xml) {
        if (xml == null) return "INACTIVE";
        try {
            Preferences handler = preferences(xml);
            // Suspension overrides retained context only after unambiguous typed XML validation.
            if (handler.suspended) return "INACTIVE";
            if (handler.context == null) return "INACTIVE";
            Object parsed = StrictJson.parse(handler.context);
            return parsed instanceof Map<?, ?> map ? flags(map, "sms", "notification") : "UNKNOWN";
        } catch (Exception | javax.xml.parsers.FactoryConfigurationError invalid) { return "UNKNOWN"; }
    }

    public static String nativeContextState(byte[] xml) {
        if (xml == null) return "ABSENT";
        try {return preferences(xml).context == null ? "ABSENT" : "PRESENT";}
        catch (Exception | javax.xml.parsers.FactoryConfigurationError invalid) {return "UNKNOWN";}
    }

    private static Preferences preferences(byte[] xml) throws Exception {
        if (xml.length > 65536) throw invalid();
        String decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(xml)).toString();
        // No DTD, entity declarations, comments or CDATA. Built-in XML text escapes remain valid.
        if (decoded.contains("<!")) throw invalid();
        Preferences handler = new Preferences();
        SAXParserFactory factory = SAXParserFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setValidating(false);
        var reader = factory.newSAXParser().getXMLReader();
        reader.setEntityResolver((publicId, systemId) -> { throw invalid(); });
        reader.setContentHandler(handler);
        reader.setErrorHandler(handler);
        reader.parse(new InputSource(new StringReader(decoded)));
        if (!handler.complete) throw invalid();
        return handler;
    }

    private static String flags(Map<?, ?> map, String first, String second) {
        if ((map.containsKey(first) && !(map.get(first) instanceof Boolean)) ||
                (map.containsKey(second) && !(map.get(second) instanceof Boolean))) return "UNKNOWN";
        return Boolean.TRUE.equals(map.get(first)) || Boolean.TRUE.equals(map.get(second)) ? "ACTIVE" : "INACTIVE";
    }

    private static SAXException invalid() { return new SAXException("TRACKING_XML_INVALID"); }

    private static final class Preferences extends DefaultHandler {
        private final Set<String> names = new HashSet<>();
        private int depth;
        private boolean started;
        private boolean complete;
        private boolean suspended;
        private String context;
        private String element;
        private StringBuilder text;

        @Override public void startPrefixMapping(String prefix, String uri) throws SAXException { throw invalid(); }
        @Override public void processingInstruction(String target, String data) throws SAXException { throw invalid(); }
        @Override public void skippedEntity(String name) throws SAXException { throw invalid(); }
        @Override public void warning(SAXParseException error) throws SAXException { throw invalid(); }
        @Override public void error(SAXParseException error) throws SAXException { throw invalid(); }
        @Override public void fatalError(SAXParseException error) throws SAXException { throw invalid(); }

        @Override public void startElement(String uri, String local, String qname, Attributes attrs) throws SAXException {
            if (!uri.isEmpty() || !local.equals(qname) || complete) throw invalid();
            if (depth == 0) {
                if (started || !"map".equals(qname) || attrs.getLength() != 0) throw invalid();
                started = true;
            } else if (depth == 1) {
                String name = attrs.getValue("name");
                if (name == null || !names.add(name)) throw invalid();
                element = qname;
                if ("boolean".equals(qname) && "suspended".equals(name)) {
                    if (attrs.getLength() != 2 || attrs.getValue("value") == null) throw invalid();
                    String value = attrs.getValue("value");
                    if (!"true".equals(value) && !"false".equals(value)) throw invalid();
                    suspended = "true".equals(value);
                } else if ("string".equals(qname) && "context".equals(name)) {
                    if (attrs.getLength() != 1) throw invalid();
                    text = new StringBuilder();
                } else throw invalid();
                for (int i = 0; i < attrs.getLength(); i++) {
                    if (!attrs.getURI(i).isEmpty() || !attrs.getLocalName(i).equals(attrs.getQName(i))) throw invalid();
                }
            } else throw invalid();
            depth++;
        }

        @Override public void characters(char[] chars, int offset, int length) throws SAXException {
            if (depth == 2 && "string".equals(element)) {
                if (text.length() + length > 24576) throw invalid();
                text.append(chars, offset, length);
            } else {
                for (int i = offset; i < offset + length; i++) {
                    char c = chars[i];
                    if (c != ' ' && c != '\n' && c != '\r' && c != '\t') throw invalid();
                }
            }
        }

        @Override public void endElement(String uri, String local, String qname) throws SAXException {
            if (depth == 2 && "string".equals(element)) context = text.toString();
            if (--depth == 0) complete = true;
            element = null;
        }
    }
}
