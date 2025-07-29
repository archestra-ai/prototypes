use strum::{Display, EnumString};

#[derive(Debug, Clone, PartialEq, Eq, Display, EnumString)]
#[strum(serialize_all = "kebab-case")]
pub enum OAuthService {
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

impl OAuthService {
    /// Check if a service is a Google service
    pub fn is_google_service(&self) -> bool {
        // All current services are Google services
        // This method exists for future extensibility when we add non-Google OAuth services
        true
    }
}
