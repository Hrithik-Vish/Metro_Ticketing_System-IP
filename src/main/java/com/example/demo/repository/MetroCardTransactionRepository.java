package com.example.demo.repository;

import com.example.demo.entity.MetroCardTransaction;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MetroCardTransactionRepository extends JpaRepository<MetroCardTransaction, String> {
    List<MetroCardTransaction> findTop20ByCardIdOrderByCreatedAtDesc(String cardId);
}
