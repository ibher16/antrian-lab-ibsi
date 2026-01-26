package database

import (
	"database/sql"
	"log"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var DB *sql.DB

func InitDB() {
	// 1. Connect to MySQL Server (without DB) to create it if missing
	dsnRoot := os.Getenv("DB_ROOT_DSN")
	if dsnRoot == "" {
		dsnRoot = "root:@tcp(127.0.0.1:3306)/" // Default for local dev
	}
	dbRoot, err := sql.Open("mysql", dsnRoot)
	if err != nil {
		log.Printf("Warning: Could not connect to MySQL root to check DB: %v", err)
	} else {
		_, err = dbRoot.Exec("CREATE DATABASE IF NOT EXISTS ibnu_sina_queue")
		if err != nil {
			log.Printf("Warning: Could not create database: %v", err)
		} else {
			log.Println("Database 'ibnu_sina_queue' ensured.")
		}
		dbRoot.Close()
	}

	// 2. Connect to the specific Database
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "root:@tcp(127.0.0.1:3306)/ibnu_sina_queue?parseTime=true"
	}

	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}

	// Retry connection
	for i := 0; i < 5; i++ {
		err = DB.Ping()
		if err == nil {
			break
		}
		log.Println("Waiting for database...", err)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatal("Could not connect to database:", err)
	}

	log.Println("Connected to MySQL Database!")

	// Auto-Migrate
	migrate()
}

func migrate() {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS categories (
			id INT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(50),
			prefix CHAR(1),
			color_code VARCHAR(7)
		);`,
		`CREATE TABLE IF NOT EXISTS queues (
			id INT AUTO_INCREMENT PRIMARY KEY,
			category_id INT,
			ticket_number INT,
			formatted_code VARCHAR(10),
			status ENUM('waiting', 'calling', 'serving', 'skipped', 'finished') DEFAULT 'waiting',
			counter_number INT DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (category_id) REFERENCES categories(id)
		);`,
		// Seed Categories if empty
		`INSERT INTO categories (id, name, prefix, color_code) 
		 SELECT 1, 'Periksa Lab', 'A', '#2563eb' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE id = 1);`,
		`INSERT INTO categories (id, name, prefix, color_code) 
		 SELECT 2, 'PCR / Swab Test', 'B', '#059669' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE id = 2);`,
		`INSERT INTO categories (id, name, prefix, color_code) 
		 SELECT 3, 'Result Collection', 'C', '#f97316' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE id = 3);`,

		// Display Settings Table
		`CREATE TABLE IF NOT EXISTS display_settings (
			id INT PRIMARY KEY DEFAULT 1,
			video_url TEXT,
			title VARCHAR(255),
			subtitle VARCHAR(255),
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
		);`,
		// Seed default settings
		`INSERT INTO display_settings (id, video_url, title, subtitle) 
		 SELECT 1, '', 'Pentingnya Mencuci Tangan', 'Tips Kesehatan Harian' 
		 WHERE NOT EXISTS (SELECT 1 FROM display_settings WHERE id = 1);`,
	}

	for _, q := range queries {
		_, err := DB.Exec(q)
		if err != nil {
			log.Printf("Migration error: %v on query: %s", err, q)
		}
	}
}
