package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "metro_card_transactions")
public class MetroCardTransaction {
    @Id public String transactionId;
    public String cardId;
    public String transactionType;
    public String description;
    public BigDecimal amount;
    public BigDecimal balanceAfter;
    public LocalDateTime createdAt;
}
