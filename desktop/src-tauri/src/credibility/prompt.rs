use crate::ollama::client::{GuardLLMEvaluationResult, OllamaClient};
use tracing::{debug, error};

pub struct Service {
    ollama_client: OllamaClient,
}

impl Service {
    pub fn new() -> Self {
        Self {
            ollama_client: OllamaClient::new(),
        }
    }

    pub async fn evaluate_prompt_credibility(
        &self,
        prompt: String,
    ) -> Result<Option<GuardLLMEvaluationResult>, String> {
        debug!("Evaluating prompt credibility");

        match self.ollama_client.guard_llm_prompt_evaluation(prompt).await {
            Ok(result) => {
                if let Some(ref eval_result) = result {
                    debug!(
                        "Prompt credibility evaluation - credible: {}, reason: {}",
                        eval_result.credible, eval_result.reason
                    );
                }
                Ok(result)
            }
            Err(e) => {
                error!("Failed to evaluate prompt credibility: {e}");
                Err(e)
            }
        }
    }
}
