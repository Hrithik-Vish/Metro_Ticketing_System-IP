package com.example.demo.controller;

import static com.example.demo.exception.Errors.blank;
import static com.example.demo.exception.Errors.conflict;

import com.example.demo.dto.LoginRequest;
import com.example.demo.dto.UserCreateRequest;
import com.example.demo.entity.User;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.PasswordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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

    private static final String INVALID_LOGIN = "Invalid user ID or password";

    private final UserRepository users;
    private final PasswordService passwords;

    public AuthController(UserRepository users, PasswordService passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @PostMapping("/signin")
    @Operation(summary = "Sign in with user ID and password", description = "401 for an unknown user, a wrong password or an inactive account.")
    public User signIn(@RequestBody LoginRequest request) {
        if (request == null || blank(request.userId()) || request.password() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_LOGIN);
        }
        User user = users.findById(request.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_LOGIN));
        if (!user.isActive || !passwords.matches(request.password(), user.password)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_LOGIN);
        }
        return user;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a passenger account",
            description = "Always creates a USER. A request asking for the ADMIN role is rejected with 403; "
                    + "admin accounts are created by an administrator through POST /api/users.")
    public User signUp(@Valid @RequestBody UserCreateRequest request) {
        if ("ADMIN".equalsIgnoreCase(request.role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Admin accounts can only be created by an administrator.");
        }
        if (users.existsById(request.userId)) {
            throw conflict("User ID already exists");
        }
        User user = new User();
        user.userId = request.userId;
        user.firstName = request.firstName;
        user.lastName = request.lastName;
        user.contact = request.contact;
        user.password = passwords.hash(request.password);
        user.role = "USER";
        user.registrationDate = LocalDate.now();
        user.isActive = true;
        return users.save(user);
    }
}
