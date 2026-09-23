package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "metro_cards")
public class MetroCard {
    @Id public String cardId;
    public String passengerId;
    public BigDecimal balance;
    public LocalDate issueDate;
    public LocalDate expiryDate;
    public LocalDateTime createdAt;
    public boolean isActive = true;
}
