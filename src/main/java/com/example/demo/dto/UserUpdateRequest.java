package com.example.demo.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Request body for updating a user. Fields that are left out keep their current value. */
@JsonIgnoreProperties(ignoreUnknown = true)
@Schema(description = "Fields to change on a user; anything omitted stays as it is")
public class UserUpdateRequest {

    @Size(max = 100, message = "firstName must be at most 100 characters")
    public String firstName;

    @Size(max = 100, message = "lastName must be at most 100 characters")
    public String lastName;

    @Email(message = "contact must be a valid email")
    public String contact;

    @Pattern(regexp = "(?i)USER|ADMIN", message = "role must be USER or ADMIN")
    public String role;

    public LocalDate registrationDate;

    public Boolean isActive;

    public LocalDate hireDate;

    public String stationId;

    @Schema(description = "Optional. When present (6 to 72 characters) the password is replaced; this is how an admin resets one.")
    public String password;
}
