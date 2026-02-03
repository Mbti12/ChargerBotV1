# ChargerBotV1

A prototype chatbot built for the **AgourAI Club**. The ChargerBot is a very early stage project focused on experimenting with an LLM backend and deployment via Cloudflare. 

---

## Environment Variables

The project relies on the following environment variables:

### `GROQ_API_KEY`

* **Description:** API key used to access Groqs LLM service 
* **Sensitivity:** Private
* **Notes:** stored as an encrypted secret in Cloudflare

### `SCHOOL_DATA`

* **Description:** Public plaintext data file used by the bot for reference
* **Sensitivity:** Public
* **Notes:**

  * static file
  * Planned to be replaced with web scraping in the future 

---

## Data Handling (IMPORTANT!!!)

* No private or sensitive student data should be included
* All referenced school data must be safe for public use
* Future scraping should follow site rules and rate limit
