package com.example.demo.controller;

import static com.example.demo.exception.Errors.requireId;
import static com.example.demo.exception.Errors.requireNewId;

import com.example.demo.entity.Payment;
import com.example.demo.repository.PaymentRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
@Tag(name = "Payments", description = "Payment records for tickets")
public class PaymentController {

    private final PaymentRepository payments;

    public PaymentController(PaymentRepository payments) {
        this.payments = payments;
    }

    @GetMapping
    @Operation(summary = "List all payments")
    public List<Payment> getAll() {
        return payments.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a payment record")
    public Payment create(@RequestBody Payment payment) {
        requireId(payment.paymentId, "Payment");
        requireNewId(payments.existsById(payment.paymentId), "Payment");
        return payments.save(payment);
    }
}
