package com.masarifi.voicequalification;

import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.FactoryConfigurationError;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Bounded preference index. Holds encrypted envelopes only; never opens AndroidKeyStore. */
final class SecureStoreKeyIndex {
    private static final String KEY_PREFIX = "masarifi.database.key.";
    private static final Set<String> ENVELOPE_FIELDS = Set.of(
            "scheme", "ct", "iv", "tlen", "keystoreAlias", "usesKeystoreSuffix", "requireAuthentication");
    private final List<Entry> entries;
    private record Entry(String fullOwnerHash, String encryptedEnvelope) {}

    private SecureStoreKeyIndex(List<Entry> entries) { this.entries = List.copyOf(entries); }

    static SecureStoreKeyIndex parse(byte[] xml) {
        if (xml == null || xml.length > 4 * 1024 * 1024) throw failure("XML_LIMIT");
        String decoded;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(xml)).toString();
        } catch (CharacterCodingException invalid) { throw failure("XML_ENCODING"); }
        // Android preference serialization needs no DTD, comment or CDATA. Reject before parsing,
        // including an internal subset, rather than relying on platform-specific parser features.
        if (decoded.contains("<!")) throw failure("XML_UNSUPPORTED_MARKUP");
        PreferenceHandler handler = new PreferenceHandler();
        try {
            SAXParserFactory factory = SAXParserFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setValidating(false);
            var reader = factory.newSAXParser().getXMLReader();
            reader.setEntityResolver((publicId, systemId) -> { throw new SAXException("XML_INVALID"); });
            reader.setContentHandler(handler);
            reader.setErrorHandler(handler);
            reader.parse(new InputSource(new StringReader(decoded)));
        } catch (Rejected invalid) { throw failure(invalid.code); }
        catch (ParserConfigurationException | SAXException | java.io.IOException invalid) {
            throw failure("XML_INVALID");
        } catch (RuntimeException | FactoryConfigurationError unavailable) {
            // Provider failures remain indeterminate without leaking private parser input or causes.
            throw failure("XML_PARSER_UNAVAILABLE");
        }
        if (!handler.rootClosed) throw failure("XML_SHAPE");
        return new SecureStoreKeyIndex(handler.entries);
    }

    ExistingDatabaseKey.Envelope owner(String prefix) {
        if (prefix == null || !prefix.matches("[0-9a-f]{24}")) throw failure("OWNER_FORMAT");
        Entry selected = null;
        for (Entry entry : entries) {
            if (!entry.fullOwnerHash.startsWith(prefix)) continue;
            if (selected != null) throw failure("KEY_AMBIGUOUS");
            selected = entry;
        }
        if (selected == null) throw failure("KEY_MISSING");
        return envelope(selected.encryptedEnvelope);
    }

    private static ExistingDatabaseKey.Envelope envelope(String encryptedEnvelope) {
        Object parsedEnvelope;
        try { parsedEnvelope = StrictJson.parse(encryptedEnvelope); }
        catch (IllegalStateException invalid) {
            if ("JSON_DUPLICATE_KEY".equals(invalid.getMessage())) throw invalid;
            throw failure("KEY_ENVELOPE");
        }
        if (!(parsedEnvelope instanceof Map<?, ?> envelope) || !ENVELOPE_FIELDS.containsAll(envelope.keySet()))
            throw failure("KEY_ENVELOPE");
        long tag;
        try { tag = StrictJson.integer(envelope.get("tlen")); }
        catch (IllegalStateException invalid) { throw failure("KEY_ENVELOPE"); }
        if (tag < 96 || tag > 128 || tag % 8 != 0) throw failure("KEY_ENVELOPE");
        return new ExistingDatabaseKey.Envelope(
                requiredString(envelope, "scheme"), optionalString(envelope, "keystoreAlias", "key_v1"),
                optionalBoolean(envelope, "requireAuthentication"), optionalBoolean(envelope, "usesKeystoreSuffix"),
                (int) tag, requiredString(envelope, "iv"), requiredString(envelope, "ct"));
    }

    private static String requiredString(Map<?, ?> envelope, String field) {
        Object value = envelope.get(field);
        if (!(value instanceof String text) || text.isEmpty()) throw failure("KEY_ENVELOPE");
        return text;
    }
    private static String optionalString(Map<?, ?> envelope, String field, String fallback) {
        return envelope.containsKey(field) ? requiredString(envelope, field) : fallback;
    }
    private static boolean optionalBoolean(Map<?, ?> envelope, String field) {
        if (!envelope.containsKey(field)) return false;
        if (!(envelope.get(field) instanceof Boolean value)) throw failure("KEY_ENVELOPE");
        return value;
    }

    private static final class PreferenceHandler extends DefaultHandler {
        private final List<Entry> entries = new ArrayList<>();
        private final Set<String> names = new HashSet<>();
        private int depth, nodes;
        private boolean rootClosed;
        private String entryTag, ownerHash;
        private StringBuilder encryptedEnvelope;

        @Override public void startElement(String uri, String local, String qualified, Attributes attributes)
                throws SAXException {
            if (++nodes > 4096 || depth >= 3) throw new Rejected("XML_LIMIT");
            if (!uri.isEmpty() || !local.equals(qualified)) throw new Rejected("XML_SHAPE");
            for (int index = 0; index < attributes.getLength(); index++)
                if (!attributes.getURI(index).isEmpty() || attributes.getQName(index).contains(":"))
                    throw new Rejected("XML_SHAPE");
            if (depth == 0) root(local, attributes);
            else if (depth == 1) preference(local, attributes);
            else if (ownerHash != null || !entryTag.equals("set") || !local.equals("string")
                    || attributes.getLength() != 0) {
                throw new Rejected("XML_SHAPE");
            }
            depth++;
        }
        private void root(String local, Attributes attributes) throws Rejected {
            if (rootClosed || !local.equals("map") || attributes.getLength() != 0)
                throw new Rejected("XML_SHAPE");
        }
        private void preference(String local, Attributes attributes) throws Rejected {
            String name = attributes.getValue("name");
            if (name == null || name.isEmpty()) throw new Rejected("XML_SHAPE");
            if (!names.add(name)) throw new Rejected("XML_DUPLICATE_KEY");
            if (names.size() > 512) throw new Rejected("XML_LIMIT");
            entryTag = local;
            ownerHash = null;
            encryptedEnvelope = null;
            if (name.contains("masarifi.database.key")) encryptedPreference(name, local, attributes);
            else if (!Set.of("string", "int", "long", "float", "boolean", "set").contains(local))
                throw new Rejected("XML_SHAPE");
        }
        private void encryptedPreference(String name, String local, Attributes attributes) throws Rejected {
            String suffix = name.startsWith("key_v1-" + KEY_PREFIX)
                    ? name.substring(("key_v1-" + KEY_PREFIX).length())
                    : name.startsWith(KEY_PREFIX) ? name.substring(KEY_PREFIX.length()) : null;
            if (suffix == null || !suffix.matches("[0-9a-f]{64}")) throw new Rejected("KEY_MAPPING_UNKNOWN");
            if (!local.equals("string") || attributes.getLength() != 1) throw new Rejected("XML_SHAPE");
            ownerHash = suffix;
            encryptedEnvelope = new StringBuilder();
        }
        @Override public void startPrefixMapping(String prefix, String uri) throws SAXException {
            throw new Rejected("XML_SHAPE");
        }
        @Override public void characters(char[] chars, int start, int length) throws SAXException {
            if (depth == 2 && encryptedEnvelope != null) {
                if (encryptedEnvelope.length() + length > 4096) throw new Rejected("KEY_ENVELOPE");
                encryptedEnvelope.append(chars, start, length);
            } else if (depth <= 1) {
                for (int index = start; index < start + length; index++)
                    if (!Character.isWhitespace(chars[index])) throw new Rejected("XML_SHAPE");
            }
        }
        @Override public void endElement(String uri, String local, String qualified) {
            if (depth == 2 && ownerHash != null) {
                entries.add(new Entry(ownerHash, encryptedEnvelope.toString()));
                encryptedEnvelope = null;
                ownerHash = null;
            }
            if (--depth == 0) rootClosed = true;
        }
        @Override public void processingInstruction(String target, String data) throws SAXException {
            throw new Rejected("XML_SHAPE");
        }
        @Override public void skippedEntity(String name) throws SAXException { throw new Rejected("XML_INVALID"); }
        @Override public void warning(SAXParseException error) throws SAXException { throw new Rejected("XML_INVALID"); }
        @Override public void error(SAXParseException error) throws SAXException { throw new Rejected("XML_INVALID"); }
        @Override public void fatalError(SAXParseException error) throws SAXException { throw new Rejected("XML_INVALID"); }
    }
    private static final class Rejected extends SAXException {
        private static final long serialVersionUID = 1L;
        final String code;
        Rejected(String code) { super(code); this.code = code; }
    }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }
}
