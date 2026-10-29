package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "metro_card_passes")
public class MetroCardPass {
    @Id public String passId;
    public String cardId;
    public String passType;
    public BigDecimal price;
    public LocalDateTime startsAt;
    public LocalDateTime expiresAt;
    public LocalDateTime createdAt;
}
