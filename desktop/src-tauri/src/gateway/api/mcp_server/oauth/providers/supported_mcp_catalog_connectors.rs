use strum::{Display, EnumString};

#[derive(Debug, Clone, PartialEq, Eq, Display, EnumString)]
#[strum(serialize_all = "kebab-case")]
pub enum SupportedMCPCatalogConnectorId {
    Gmail,
    GoogleDrive,
    GoogleCalendar,
    GoogleDocs,
    GoogleSheets,
    GoogleSlides,
    GoogleForms,
    GoogleTasks,
    GoogleChat,
}

impl SupportedMCPCatalogConnectorId {
    /// Check if an mcp catalog connector id is related to the Google provider
    pub fn is_google_connector(&self) -> bool {
        // All current mcp catalog connectors are Google mcp catalog connectors
        // This method exists for future extensibility when we add non-Google mcp catalog connectors
        true
    }
}
