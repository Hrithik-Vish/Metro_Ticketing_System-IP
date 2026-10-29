package com.example.demo.controller;

import static com.example.demo.exception.Errors.badRequest;
import static com.example.demo.exception.Errors.conflict;

import com.example.demo.dto.LoginRequest;
import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Sign in and sign up")
public class AuthController {

    private final UserRepository users;

    public AuthController(UserRepository users) {
        this.users = users;
    }

    @PostMapping("/signin")
    @Operation(summary = "Sign in with user ID and password")
    public User signIn(@RequestBody LoginRequest request) {
        User user = users.findById(request.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user ID or password"));
        if (!user.isActive || user.password == null || !user.password.equals(request.password())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user ID or password");
        }
        return user;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new account")
    public User signUp(@RequestBody User user) {
        if (user.userId == null || user.userId.isBlank() || user.password == null || user.password.isBlank()) {
            throw badRequest("User ID and password are required");
        }
        if (users.existsById(user.userId)) {
            throw conflict("User ID already exists");
        }
        user.role = user.role == null || user.role.isBlank() ? "USER" : user.role;
        user.registrationDate = user.registrationDate == null ? LocalDate.now() : user.registrationDate;
        user.isActive = true;
        return users.save(user);
    }
}
