package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;

@Entity
@Table(name = "users")
public class User {
    @Id public String userId;
    public String firstName;
    public String lastName;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    public String password;
    public String role;
    public String contact;
    public LocalDate registrationDate;
    public boolean isActive = true;
    public LocalDate hireDate;
    public String stationId;
}
