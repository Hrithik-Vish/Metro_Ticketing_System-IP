package com.example.demo.service;

import static com.example.demo.exception.Errors.badRequest;

import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** All password handling lives here: validation, hashing, checking, and hashing old plain-text passwords. */
@Service
public class PasswordService {

    private static final int MIN_LENGTH = 6;
    private static final int MAX_BYTES = 72; // BCrypt only uses the first 72 bytes

    private final PasswordEncoder encoder;
    private final UserRepository users;

    public PasswordService(PasswordEncoder encoder, UserRepository users) {
        this.encoder = encoder;
        this.users = users;
    }

    /** Validates a new password and returns its BCrypt hash. */
    public String hash(String rawPassword) {
        if (rawPassword == null || rawPassword.length() < MIN_LENGTH) {
            throw badRequest("Password must be at least " + MIN_LENGTH + " characters");
        }
        if (rawPassword.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) {
            throw badRequest("Password must be at most " + MAX_BYTES + " characters");
        }
        return encoder.encode(rawPassword);
    }

    /** True when the plain password matches the stored hash. */
    public boolean matches(String rawPassword, String storedHash) {
        return rawPassword != null && isHashed(storedHash) && encoder.matches(rawPassword, storedHash);
    }

    public static boolean isHashed(String stored) {
        return stored != null && stored.startsWith("$2");
    }

    /**
     * Runs at startup: any account that still has an old plain-text password gets it replaced by a hash.
     * It is safe to run on every start; accounts that are already hashed are skipped.
     */
    @Transactional
    public int hashLegacyPasswords() {
        int converted = 0;
        for (User user : users.findAll()) {
            if (user.password == null || user.password.isBlank() || isHashed(user.password)) continue;
            try {
                user.password = encoder.encode(user.password);
                users.save(user);
                converted++;
            } catch (IllegalArgumentException tooLong) {
                // An old password that BCrypt cannot hash (over 72 bytes): leave it; that user can be reset by an admin.
            }
        }
        return converted;
    }
}
