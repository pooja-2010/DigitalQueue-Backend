
package com.digitalqueue.backend.controller;

import com.digitalqueue.backend.entity.QueueToken;
import com.digitalqueue.backend.repository.QueueTokenRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/queue")
@CrossOrigin(origins = "http://localhost:5173")
public class QueueController {

    private final QueueTokenRepository repository;

    public QueueController(QueueTokenRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<QueueToken> getQueue() {
        return repository.findAllByOrderByIdAsc();
    }

    @PostMapping
    public QueueToken createToken(@RequestBody QueueToken request) {
        QueueToken token = new QueueToken();

        token.setTokenNumber(
            "Q" + String.format("%03d", repository.count() + 1)
        );
        token.setCustomerName(request.getCustomerName());
        token.setServiceName(request.getServiceName());
        token.setStatus("WAITING");

        return repository.save(token);
    }

    // Prototype admin login
    @PostMapping("/admin-login")
    public Map<String, Object> adminLogin(
            @RequestBody Map<String, String> credentials) {

        String username = credentials.get("username");
        String password = credentials.get("password");

        if ("admin".equals(username)
                && "Admin@123".equals(password)) {
            return Map.of("success", true, "message", "Login successful");
        }

        return Map.of("success", false, "message", "Invalid credentials");
    }

    // Call the next waiting customer
    @PostMapping("/next")
    public QueueToken callNext() {
        List<QueueToken> waiting =
            repository.findByStatusOrderByIdAsc("WAITING");

        if (waiting.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND,
                "No waiting customers"
            );
        }

        QueueToken next = waiting.get(0);
        next.setStatus("SERVING");

        return repository.save(next);
    }

    // Mark a token as served
    @PutMapping("/{id}/serve")
    public QueueToken markServed(@PathVariable Long id) {
        QueueToken token = repository.findById(id)
            .orElseThrow(() ->
                new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND,
                    "Token not found"
                )
            );

        token.setStatus("SERVED");
        return repository.save(token);
    }
}
