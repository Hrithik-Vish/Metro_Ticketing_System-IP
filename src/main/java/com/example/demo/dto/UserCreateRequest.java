package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request body for creating a user (admin) or signing up (passenger). */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Details for a new account")
public class UserCreateRequest {

    @NotBlank(message = "userId is required")
    @Pattern(regexp = "[^\\s]{3,50}", message = "userId must be 3 to 50 characters with no spaces")
    @Schema(description = "Unique login ID", example = "demo1")
    public String userId;

    @NotBlank(message = "firstName is required")
    @Size(max = 100, message = "firstName must be at most 100 characters")
    @Schema(example = "Asha")
    public String firstName;

    @Size(max = 100, message = "lastName must be at most 100 characters")
    @Schema(description = "Optional", example = "Nair")
    public String lastName;

    @NotBlank(message = "password is required")
    @Size(min = 6, max = 72, message = "password must be 6 to 72 characters")
    @Schema(description = "Stored as a BCrypt hash, never returned by the API", example = "secret123")
    public String password;

    @NotBlank(message = "contact is required")
    @Email(message = "contact must be a valid email")
    @Schema(example = "asha@example.com")
    public String contact;

    @Pattern(regexp = "(?i)USER|ADMIN", message = "role must be USER or ADMIN")
    @Schema(description = "USER (default) or ADMIN. Sign-up always creates a USER and rejects ADMIN with 403.", example = "USER")
    public String role;

    @Schema(description = "Defaults to today")
    public LocalDate registrationDate;

    @Schema(description = "Defaults to true")
    public Boolean isActive;

    @Schema(description = "Optional hire date for staff")
    public LocalDate hireDate;

    @Schema(description = "Optional station for staff accounts")
    public String stationId;
}
