package com.example.demo.exception;

import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Small helpers so every controller and service builds API errors the same way. */
public final class Errors {

    private Errors() {}

    public static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public static ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }

    public static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    /** Creating something with an ID that already exists would silently overwrite it, so refuse with 409. */
    public static void requireNewId(boolean exists, String label) {
        if (exists) throw conflict(label + " ID already exists");
    }

    /** An ID the client must send was missing or blank. */
    public static void requireId(String id, String label) {
        if (blank(id)) throw badRequest(label + " ID is required");
    }

    /** 404 when the record addressed by the URL does not exist. */
    public static void requireFound(boolean exists, String label, String id) {
        if (!exists) throw notFound(label + " not found: " + id);
    }

    /** 400 when a record referenced from the request body (a foreign key) does not exist. */
    public static void requireReference(boolean exists, String label, String id) {
        if (!exists) throw badRequest(label + " not found: " + id);
    }

    /** One "is something still using this record?" check, see {@link #requireUnused}. */
    public record Usage(String label, boolean used) {}

    public static Usage use(String label, boolean used) {
        return new Usage(label, used);
    }

    /** 409 listing what still uses the record, so a used record is never deleted out from under other data. */
    public static void requireUnused(String what, String id, Usage... usages) {
        List<String> inUse = new ArrayList<>();
        for (Usage usage : usages) {
            if (usage.used()) inUse.add(usage.label());
        }
        if (!inUse.isEmpty()) {
            throw conflict(what + " " + id + " is still used by " + String.join(", ", inUse)
                    + ". Remove or reassign those records first.");
        }
    }
}
