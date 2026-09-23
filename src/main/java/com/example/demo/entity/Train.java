package com.example.demo.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "trains")
public class Train {
    @Id public String trainId;
    public String trainNumber;
    public Integer capacity;
    public Integer totalCoaches;
    public Integer manufactureYear;
    public LocalDateTime createdAt;
    public boolean isActive = true;
}
