package com.example.demo.repository;

import com.example.demo.entity.MetroCard;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MetroCardRepository extends JpaRepository<MetroCard, String> {
}
