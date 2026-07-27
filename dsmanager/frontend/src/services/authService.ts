import { API_BASE } from "@/shared/apiHelper";
/**
 * Authentication Service
 * Manages API key authentication for Grace AI
 */

import * as Sentry from "@sentry/react";

const API_KEY_STORAGE_KEY = "grace_api_key";
const USER_ID_STORAGE_KEY = "grace_user_id";
const USER_ROLE_STORAGE_KEY = "grace_user_role";

export interface AuthState {
  apiKey: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  role?: string;
  isTeacher?: boolean;
  isStudent?: boolean;
}

/**
 * Get stored API key from localStorage
 * NOTE: API key authentication removed - Railway handles authentication
 * This function returns null to indicate no API key is needed
 */
export const getStoredApiKey = (): string | null => {
  // API key authentication removed - Railway handles authentication
  return null;
};

/**
 * Store API key in localStorage
 */
export const storeApiKey = (apiKey: string): void => {
  try {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch (error) {
    console.error("Failed to store API key:", error);
  }
};

/**
 * Remove API key from localStorage (logout)
 */
export const clearApiKey = (): void => {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(USER_ID_STORAGE_KEY);
    localStorage.removeItem("grace_is_admin");
    localStorage.removeItem(USER_ROLE_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear API key:", error);
  }
};

/**
 * Default user ID — matches backend DEFAULT_USER_ID and seeded database user.
 * When real auth is implemented, replace with dynamic session-bound ID.
 */
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Get stored user ID, or return default if none found
 * For now, we use a single default user ID for all operations
 */
export const getStoredUserId = (): string => {
  try {
    const stored = localStorage.getItem(USER_ID_STORAGE_KEY);
    const uid = (
      stored &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)
    ) ? stored : DEFAULT_USER_ID;

    // Set Sentry user context for AI conversation attribution
    Sentry.setUser({ id: uid });

    return uid;
  } catch {
    console.error("[auth] localStorage unavailable — cannot persist user session.");
    return DEFAULT_USER_ID;
  }
};

/**
 * Store user ID
 */
export const storeUserId = (userId: string): void => {
  try {
    localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  } catch (error) {
    console.error("Failed to store user ID:", error);
  }
};

/**
 * Get current authentication state
 * Note: API key authentication removed - Railway handles authentication
 * Uses single default user ID for now
 */
export const getAuthState = (): AuthState => {
  const userId = getStoredUserId(); // Always returns a user ID (default if none stored)
  const isAdmin = localStorage.getItem("grace_is_admin") === "true";
  const role = localStorage.getItem(USER_ROLE_STORAGE_KEY) || "student";
  const isTeacher = role === "teacher";
  const isStudent = role === "student";

  // Always return authenticated - Railway handles authentication
  // FORCE AUTHENTICATION FOR DEVELOPMENT - bypass login screen
  return {
    apiKey: null, // No longer used
    userId,
    isAuthenticated: true, // FORCE authenticated to bypass login
    isAdmin,
    role,
    isTeacher,
    isStudent,
  };
};

/**
 * Validate API key with backend
 */
export const validateApiKey = async (
  apiKey: string,
): Promise<{
  valid: boolean;
  userId?: string;
  isAdmin?: boolean;
  role?: string;
  isTeacher?: boolean;
  isStudent?: boolean;
  error?: string;
}> => {
  // Use relative URL for local dev (vite proxy handles /api routes)
  // In production, use VITE_API_URL env var
  const API_BASE_URL = import.meta.env.VITE_API_URL || "";

  try {
    const url = `${API_BASE_URL}/api/auth/validate`;
    console.log("🔍 Validating API key at:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    console.log("📡 Response status:", response.status, response.statusText);

    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ Authentication failed:", errorData);
      return { valid: false, error: errorData.error || "Invalid API key" };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("❌ Server error:", response.status, errorText);
      return { valid: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();
    console.log("✅ API Response:", JSON.stringify(data, null, 2));

    if (data.valid) {
      // DON'T store user ID here - let login() function handle it after validation
      // Just return the data for login() to process
      // Handle both snake_case (user_id) and camelCase (userId) formats
      const userId = data.user_id || data.userId;
      console.log("🔍 Extracted userId:", userId, "from data:", {
        user_id: data.user_id,
        userId: data.userId,
      });

      if (!userId) {
        console.error("❌ API returned valid=true but no user_id:", data);
        console.error("❌ Full response data:", JSON.stringify(data, null, 2));
        return {
          valid: false,
          error: "Server did not return a user ID. Please try again.",
        };
      }

      console.log("✅ Validation successful, userId:", userId);
      const role = data.role || "student";
      return {
        valid: true,
        userId,
        isAdmin: data.is_admin || data.isAdmin || false,
        role,
        isTeacher: data.is_teacher || data.isTeacher || false,
        isStudent: data.is_student || data.isStudent || false,
      };
    }

    console.error("❌ API returned valid=false:", data);
    return { valid: false, error: data.error || "Invalid API key" };
  } catch (error) {
    console.error("❌ API key validation error:", error);
    if (error instanceof Error) {
      console.error("❌ Error details:", error.message, error.stack);
    }
    return {
      valid: false,
      error: `Failed to connect to server: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
};

/**
 * Clear any old/invalid user IDs from storage
 */
export const clearInvalidUserIds = (): void => {
  try {
    const userId = localStorage.getItem(USER_ID_STORAGE_KEY);
    if (userId) {
      // Check if it's a valid UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        // Invalid format - clear it
        console.warn(
          "⚠️ Clearing invalid user ID format from storage:",
          userId,
        );
        localStorage.removeItem(USER_ID_STORAGE_KEY);
        localStorage.removeItem("grace_is_admin");
      }

      // NOTE: The admin user ID '994cf308-b467-4a48-ab6a-dbbcdb81e4e4' is now VALID
      // It exists in the database for admin@grace.coop, so we should NOT clear it
      // Only clear invalid formats, not valid UUIDs that exist in the database

      // Also clear any user_1, default_user, etc.
      if (userId.startsWith("user_") || userId === "default_user") {
        console.warn("⚠️ Clearing old invalid user ID:", userId);
        localStorage.removeItem(USER_ID_STORAGE_KEY);
        localStorage.removeItem("grace_is_admin");
      }
    }
  } catch (error) {
    console.error("Error checking user ID:", error);
  }
};

/**
 * Login with email/username and password
 */
export const login = async (
  email: string,
  password: string,
): Promise<{
  success: boolean;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
  isTeacher?: boolean;
  isAdmin?: boolean;
  error?: string;
}> => {
  if (!email || !password) {
    return { success: false, error: "Email and password are required" };
  }

  // CRITICAL: Clear ALL old user IDs before validating
  // This prevents using cached invalid IDs that cause foreign key violations
  clearInvalidUserIds();
  // Also force clear any cached user ID to ensure fresh login
  localStorage.removeItem(USER_ID_STORAGE_KEY);
  localStorage.removeItem("grace_is_admin");
  localStorage.removeItem(USER_ROLE_STORAGE_KEY);

  try {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "";
    const url = `${API_BASE_URL}/api/auth/login`;

    console.log("🔍 Logging in at:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    console.log(
      "📡 Login response status:",
      response.status,
      response.statusText,
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      console.error("❌ Login failed:", errorData);
      return { success: false, error: errorData.error || "Login failed" };
    }

    const data = await response.json();
    console.log("✅ Login response:", JSON.stringify(data, null, 2));

    if (data.success) {
      const userId = data.user_id || data.userId;

      if (!userId) {
        console.error("❌ Login returned success but no user_id:", data);
        return {
          success: false,
          error: "Server did not return a user ID. Please try again.",
        };
      }

      // Validate it's a UUID before storing
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(userId)) {
        storeUserId(userId);
        console.log("✅ Stored valid user ID from database:", userId);

        // Store admin status if applicable
        if (data.is_admin || data.isAdmin) {
          localStorage.setItem("grace_is_admin", "true");
        } else {
          localStorage.removeItem("grace_is_admin");
        }

        // Store user role
        if (data.role) {
          localStorage.setItem(USER_ROLE_STORAGE_KEY, data.role);
          console.log("✅ Stored user role:", data.role);
        } else {
          localStorage.setItem(USER_ROLE_STORAGE_KEY, "student");
        }

        return {
          success: true,
          userId,
          email: data.email,
          name: data.name,
          role: data.role || "student",
          isTeacher: data.is_teacher || data.isTeacher || false,
          isAdmin: data.is_admin || data.isAdmin || false,
        };
      } else {
        console.error(
          "❌ Invalid user ID format received from server:",
          userId,
        );
        return {
          success: false,
          error:
            "Invalid user ID received from server. Please contact support.",
        };
      }
    }

    return { success: false, error: data.error || "Login failed" };
  } catch (error: any) {
    console.error("❌ Login error:", error);
    return {
      success: false,
      error:
        error.message ||
        "Failed to connect to server. Please check your connection and try again.",
    };
  }
};

/**
 * Logout
 */
export const logout = (): void => {
  // Clear everything on logout
  clearApiKey();
  clearInvalidUserIds(); // Clear any invalid user IDs
  // Also clear any cached user ID to force fresh login
  localStorage.removeItem(USER_ID_STORAGE_KEY);
  localStorage.removeItem("grace_is_admin");
  localStorage.removeItem(USER_ROLE_STORAGE_KEY);
  // Redirect to login will be handled by App.tsx
};

/**
 * Sign up a new user
 */
export const signup = async (
  email: string,
  password: string,
  fullName: string,
  role: "teacher" | "student" = "student",
): Promise<{
  success: boolean;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
  error?: string;
}> => {
  if (!email || !password) {
    return { success: false, error: "Email and password are required" };
  }

  if (password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  try {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "";
    const url = `${API_BASE_URL}/api/auth/signup`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      return { success: false, error: errorData.error || "Signup failed" };
    }

    const data = await response.json();

    if (data.success) {
      // Store user ID and role
      if (data.user_id) {
        storeUserId(data.user_id);
        if (data.role) {
          localStorage.setItem(USER_ROLE_STORAGE_KEY, data.role);
        }
      }

      return {
        success: true,
        userId: data.user_id,
        email: data.email,
        name: data.name,
        role: data.role,
      };
    }

    return { success: false, error: data.error || "Signup failed" };
  } catch (error: any) {
    console.error("❌ Signup error:", error);
    return {
      success: false,
      error:
        error.message ||
        "Failed to connect to server. Please check your connection and try again.",
    };
  }
};

/**
 * Get API key for use in API calls
 * Note: API key authentication removed - Railway handles authentication
 * This function returns null as API keys are no longer required
 */
export const getApiKey = (): string | null => {
  // API keys no longer required - Railway handles authentication
  return null;
};

/**
 * Initialize authentication for development - ensure user is always authenticated
 * This bypasses the login screen for development purposes
 */
export const initializeDevAuth = (): void => {
  try {
    // Ensure we have a valid user ID stored
    const userId = getStoredUserId();
    console.log("🔑 Dev Auth: Using user ID:", userId);
    
    // Mark as authenticated
    localStorage.setItem("grace_is_authenticated", "true");
    
    // Set a default role if none exists
    if (!localStorage.getItem(USER_ROLE_STORAGE_KEY)) {
      localStorage.setItem(USER_ROLE_STORAGE_KEY, "student");
    }
    
    console.log("✅ Development authentication initialized - login screen bypassed");
  } catch (error) {
    console.error("❌ Failed to initialize dev auth:", error);
  }
};
