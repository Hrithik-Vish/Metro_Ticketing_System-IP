package com.example.demo.repository;

import com.example.demo.entity.Fare;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FareRepository extends JpaRepository<Fare, String> {
}
