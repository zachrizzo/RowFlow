use crate::error::Result;
use serde::{Deserialize, Serialize};
use typeshare::typeshare;

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentIntent {
    Greeting,
    SmallTalk,
    DatabaseQuery,
    Unknown,
}

#[typeshare]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentState {
    pub message: String,
    pub intent: AgentIntent,
    pub context: Option<String>,
    pub response: Option<String>,
    pub sql: Option<String>,
    pub should_search: bool,
}

pub struct Agent {
    endpoint: String,
    chat_model: String,
}

impl Agent {
    pub fn new(endpoint: String, chat_model: String) -> Self {
        Self {
            endpoint,
            chat_model,
        }
    }

    fn create_client(&self) -> crate::ai::ollama::OllamaClient {
        crate::ai::ollama::OllamaClient::new(Some(self.endpoint.clone()))
    }

    /// Classify user intent using LLM with heuristic fallback
    pub async fn classify_intent(&self, message: &str) -> Result<AgentIntent> {
        let msg_lower = message.trim().to_lowercase();
        
        // Quick heuristic check for obvious greetings (before LLM call for speed)
        let obvious_greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "greetings"];
        if obvious_greetings.iter().any(|g| msg_lower == *g || msg_lower.starts_with(&format!("{} ", g))) {
            return Ok(AgentIntent::Greeting);
        }

        // Check for database query keywords - if found, skip LLM and return database_query
        let db_keywords = [
            "find", "show", "list", "get", "search", "look", "check", "have", "do we have",
            "how many", "what", "where", "who", "which", "select", "query", "data",
            "bake", "mouse", "cake", "product", "user", "order", "table",
        ];
        if db_keywords.iter().any(|k| msg_lower.contains(k)) {
            return Ok(AgentIntent::DatabaseQuery);
        }

        // For ambiguous cases, use LLM classification
        let classification_prompt = format!(
            r#"Classify this message for a database assistant. Choose ONE category:

- greeting: ONLY simple greetings like "hi", "hello", "hey" (nothing else)
- small_talk: ONLY casual chat like "how are you", "thanks", "ok" (no data questions)
- database_query: ANY question about finding/showing/listing/checking data, products, users, or anything in a database

Message: "{}"

If it asks about finding, showing, listing, checking, or searching for ANYTHING, it's database_query.
If unsure, choose database_query.

Respond with ONLY one word: greeting, small_talk, or database_query"#,
            message.trim()
        );

        let response = match self.create_client().complete(&self.chat_model, &classification_prompt).await {
            Ok(r) => r,
            Err(_) => {
                // If LLM fails, default to database query
                return Ok(AgentIntent::DatabaseQuery);
            }
        };

        let intent_str = response.trim().to_lowercase();
        let intent = if intent_str.contains("greeting") && !intent_str.contains("database") && !intent_str.contains("query") {
            AgentIntent::Greeting
        } else if intent_str.contains("small_talk") || intent_str.contains("smalltalk") {
            AgentIntent::SmallTalk
        } else {
            // Default to database query for anything else
            AgentIntent::DatabaseQuery
        };

        Ok(intent)
    }

    /// Generate appropriate response based on intent
    pub async fn generate_response(&self, state: &mut AgentState) -> Result<()> {
        match &state.intent {
            AgentIntent::Greeting => {
                state.response = Some(
                    "Hello! I'm here to help you explore your database. Ask me questions about your data, and I'll find relevant information using semantic search.".to_string()
                );
                state.should_search = false;
            }
            AgentIntent::SmallTalk => {
                state.response = Some(
                    "I'm doing well, thanks! I'm here to help you query your database. What would you like to know about your data?".to_string()
                );
                state.should_search = false;
            }
            AgentIntent::DatabaseQuery => {
                // For database queries, we'll let the frontend handle RAG search
                // This agent just classifies and provides a response template
                state.should_search = true;
                state.response = Some(
                    "Let me search your database for relevant information...".to_string()
                );
            }
            AgentIntent::Unknown => {
                // Default to treating as database query if uncertain
                state.should_search = true;
                state.response = Some(
                    "I'll help you search your database for that information.".to_string()
                );
            }
        }

        Ok(())
    }

    /// Process a user message through the agent workflow (LangGraph-style)
    pub async fn process_message(&self, message: String) -> Result<AgentState> {
        let mut state = AgentState {
            message: message.clone(),
            intent: AgentIntent::Unknown,
            context: None,
            response: None,
            sql: None,
            should_search: false,
        };

        // Step 1: Classify intent
        state.intent = self.classify_intent(&message).await?;

        // Step 2: Generate response based on intent
        self.generate_response(&mut state).await?;

        Ok(state)
    }
}
