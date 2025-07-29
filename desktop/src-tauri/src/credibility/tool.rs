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

    pub async fn evaluate_tool_call_credibility(
        &self,
        tool_call: String,
    ) -> Result<Option<GuardLLMEvaluationResult>, String> {
        debug!("Evaluating tool call credibility");

        match self
            .ollama_client
            .guard_llm_tool_evaluation(tool_call)
            .await
        {
            Ok(result) => {
                if let Some(ref eval_result) = result {
                    debug!(
                        "Tool call credibility evaluation - credible: {}, reason: {}",
                        eval_result.credible, eval_result.reason
                    );
                }
                Ok(result)
            }
            Err(e) => {
                error!("Failed to evaluate tool call credibility: {e}");
                Err(e)
            }
        }
    }
}
