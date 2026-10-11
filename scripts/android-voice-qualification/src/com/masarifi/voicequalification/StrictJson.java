package com.masarifi.voicequalification;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Bounded JSON for private diagnostic inputs; ambiguous/corrupt data is never empty. */
final class StrictJson {
    private static final Pattern NUMBER = Pattern.compile("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?");
    private record NumberValue(String raw) {}
    private final String input;
    private int position;
    private int nodes;
    private StrictJson(String input) { this.input = input; }

    static Object parse(String input) {
        if (input == null) throw failure("JSON_INVALID");
        if (input.length() > 24576) throw failure("JSON_LIMIT");
        StrictJson parser = new StrictJson(input);
        Object result = parser.value(0);
        parser.whitespace();
        if (parser.position != input.length()) throw failure("JSON_INVALID");
        return result;
    }

    static long integer(Object value) {
        if (!(value instanceof NumberValue number) || number.raw.length() > 64) throw failure("JSON_INTEGER");
        try {
            BigDecimal decimal = new BigDecimal(number.raw);
            // Bound exponent/precision before longValueExact can expand a huge power.
            if (decimal.scale() < -64 || decimal.scale() > 64 ||
                    decimal.precision() - (long) decimal.scale() > 19) throw failure("JSON_INTEGER");
            return decimal.longValueExact();
        } catch (NumberFormatException | ArithmeticException invalid) { throw failure("JSON_INTEGER"); }
    }

    private Object value(int depth) {
        if (depth > 24 || ++nodes > 4096) throw failure("JSON_LIMIT");
        whitespace();
        if (position >= input.length()) throw failure("JSON_INVALID");
        char next = input.charAt(position);
        if (next == '{') return object(depth + 1);
        if (next == '[') return array(depth + 1);
        if (next == '"') return string();
        if (next == 't') { literal("true"); return Boolean.TRUE; }
        if (next == 'f') { literal("false"); return Boolean.FALSE; }
        if (next == 'n') { literal("null"); return null; }
        var match = NUMBER.matcher(input).region(position, input.length());
        if (!match.lookingAt()) throw failure("JSON_INVALID");
        String number = match.group();
        if (number.length() > 64) throw failure("JSON_LIMIT");
        position = match.end();
        return new NumberValue(number);
    }

    private Map<String, Object> object(int depth) {
        position++;
        Map<String, Object> values = new LinkedHashMap<>();
        whitespace();
        if (consume('}')) return values;
        while (true) {
            whitespace();
            if (position >= input.length() || input.charAt(position) != '"') throw failure("JSON_INVALID");
            String key = string();
            if (values.containsKey(key)) throw failure("JSON_DUPLICATE_KEY");
            whitespace();
            require(':');
            values.put(key, value(depth));
            whitespace();
            if (consume('}')) return values;
            require(',');
        }
    }

    private List<Object> array(int depth) {
        position++;
        List<Object> values = new ArrayList<>();
        whitespace();
        if (consume(']')) return values;
        while (true) {
            values.add(value(depth));
            whitespace();
            if (consume(']')) return values;
            require(',');
        }
    }

    private String string() {
        require('"');
        StringBuilder text = new StringBuilder();
        while (position < input.length()) {
            char value = input.charAt(position++);
            if (value == '"') {
                String result = text.toString();
                for (int index = 0; index < result.length(); index++) {
                    char point = result.charAt(index);
                    if (Character.isHighSurrogate(point)) {
                        if (++index >= result.length() || !Character.isLowSurrogate(result.charAt(index)))
                            throw failure("JSON_INVALID");
                    } else if (Character.isLowSurrogate(point)) throw failure("JSON_INVALID");
                }
                return result;
            }
            if (value < 32) throw failure("JSON_INVALID");
            if (value != '\\') { text.append(value); continue; }
            if (position >= input.length()) throw failure("JSON_INVALID");
            char escaped = input.charAt(position++);
            switch (escaped) {
                case '"', '\\', '/' -> text.append(escaped);
                case 'b' -> text.append('\b');
                case 'f' -> text.append('\f');
                case 'n' -> text.append('\n');
                case 'r' -> text.append('\r');
                case 't' -> text.append('\t');
                case 'u' -> {
                    if (position + 4 > input.length()) throw failure("JSON_INVALID");
                    int unit = 0;
                    for (int index = 0; index < 4; index++) {
                        char digit = input.charAt(position++);
                        int nibble = digit >= '0' && digit <= '9' ? digit - '0' :
                                digit >= 'a' && digit <= 'f' ? digit - 'a' + 10 :
                                digit >= 'A' && digit <= 'F' ? digit - 'A' + 10 : -1;
                        if (nibble < 0) throw failure("JSON_INVALID");
                        unit = unit * 16 + nibble;
                    }
                    text.append((char) unit);
                }
                default -> throw failure("JSON_INVALID");
            }
        }
        throw failure("JSON_INVALID");
    }

    private void literal(String text) {
        if (!input.startsWith(text, position)) throw failure("JSON_INVALID");
        position += text.length();
    }
    private void whitespace() {
        while (position < input.length() && " \t\n\r".indexOf(input.charAt(position)) >= 0) position++;
    }
    private boolean consume(char expected) {
        if (position < input.length() && input.charAt(position) == expected) { position++; return true; }
        return false;
    }
    private void require(char expected) { if (!consume(expected)) throw failure("JSON_INVALID"); }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }
}
