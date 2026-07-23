/**
 * Secure File Upload Middleware for Grace AI
 * Protects against malicious uploads, disk exhaustion, and file-based attacks
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ============================================
// SECURITY CONFIGURATION
// ============================================
const UPLOAD_CONFIG = {
  // File size limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  maxFilesPerRequest: parseInt(process.env.MAX_FILES_PER_REQUEST) || 5,
  maxTotalSize: parseInt(process.env.MAX_TOTAL_SIZE) || 50 * 1024 * 1024, // 50MB total
  
  // Disk space protection
  minFreeDiskSpaceMB: parseInt(process.env.MIN_FREE_DISK_MB) || 1024, // 1GB minimum
  uploadDirQuotaMB: parseInt(process.env.UPLOAD_DIR_QUOTA_MB) || 5120, // 5GB quota
  
  // Allowed file types
  allowedMimeTypes: [
    'application/pdf',
    'text/plain',
    'application/json',
  ],
  
  allowedExtensions: [
    '.pdf',
    '.txt',
    '.json',
  ],
  
  // Upload directory
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  
  // Temporary directory for scanning
  tempDir: process.env.TEMP_DIR || 'uploads/temp',
  
  // Auto-cleanup settings
  autoCleanupEnabled: process.env.AUTO_CLEANUP !== 'false',
  cleanupAfterMinutes: parseInt(process.env.CLEANUP_AFTER_MINUTES) || 60, // 1 hour
};

// Create directories if they don't exist
[UPLOAD_CONFIG.uploadDir, UPLOAD_CONFIG.tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================
// FILE VALIDATION FUNCTIONS
// ============================================

/**
 * Validate file MIME type
 */
function validateMimeType(file) {
  const mimeType = file.mimetype;
  
  if (!UPLOAD_CONFIG.allowedMimeTypes.includes(mimeType)) {
    throw new Error(
      `Invalid file type: ${mimeType}. Allowed types: ${UPLOAD_CONFIG.allowedMimeTypes.join(', ')}`
    );
  }
  
  return true;
}

/**
 * Validate file extension
 */
function validateExtension(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  if (!UPLOAD_CONFIG.allowedExtensions.includes(ext)) {
    throw new Error(
      `Invalid file extension: ${ext}. Allowed extensions: ${UPLOAD_CONFIG.allowedExtensions.join(', ')}`
    );
  }
  
  return true;
}

/**
 * Check for malicious file patterns (basic checks)
 */
function checkMaliciousPatterns(buffer) {
  // Check for executable signatures
  const executableSignatures = [
    Buffer.from([0x4D, 0x5A]), // MZ (Windows EXE)
    Buffer.from([0x7F, 0x45, 0x4C, 0x46]), // ELF (Linux executable)
    Buffer.from([0xCA, 0xFE, 0xBA, 0xBE]), // Mach-O (macOS executable)
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP (could contain malware)
  ];
  
  for (const signature of executableSignatures) {
    if (buffer.slice(0, signature.length).equals(signature)) {
      throw new Error('File appears to be an executable or archive - not allowed');
    }
  }
  
  // Check PDF signature
  const pdfHeader = buffer.slice(0, 5).toString('ascii');
  if (pdfHeader !== '%PDF-') {
    // If claiming to be PDF, verify header
    throw new Error('Invalid PDF file structure');
  }
  
  return true;
}

/**
 * Validate PDF structure (basic checks)
 */
function validatePDFStructure(buffer) {
  const content = buffer.toString('ascii', 0, Math.min(1000, buffer.length));
  
  // Check for PDF header
  if (!content.startsWith('%PDF-')) {
    throw new Error('Invalid PDF: Missing PDF header');
  }
  
  // Check for suspicious JavaScript or embedded files
  const suspiciousPatterns = [
    '/JavaScript',
    '/JS',
    '/EmbeddedFile',
    '/Launch',
    '/URI',
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (content.includes(pattern)) {
      console.warn(`⚠️  PDF contains suspicious pattern: ${pattern}`);
      // Don't reject, but log for review
    }
  }
  
  return true;
}

/**
 * Check available disk space
 */
async function checkDiskSpace() {
  try {
    // Use 'df' command on Unix-like systems
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);
    
    const { stdout } = await execPromise(`df -BM "${UPLOAD_CONFIG.uploadDir}" | tail -1 | awk '{print $4}'`);
    const freeMB = parseInt(stdout.trim().replace('M', ''));
    
    if (freeMB < UPLOAD_CONFIG.minFreeDiskSpaceMB) {
      throw new Error(
        `Insufficient disk space: ${freeMB}MB available, ${UPLOAD_CONFIG.minFreeDiskSpaceMB}MB required`
      );
    }
    
    return freeMB;
  } catch (error) {
    console.warn('⚠️  Could not check disk space:', error.message);
    // Don't block upload if we can't check
    return Infinity;
  }
}

/**
 * Check upload directory quota
 */
function checkUploadQuota() {
  try {
    let totalSize = 0;
    
    const files = fs.readdirSync(UPLOAD_CONFIG.uploadDir);
    for (const file of files) {
      const filePath = path.join(UPLOAD_CONFIG.uploadDir, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
    
    const totalMB = totalSize / (1024 * 1024);
    
    if (totalMB > UPLOAD_CONFIG.uploadDirQuotaMB) {
      throw new Error(
        `Upload directory quota exceeded: ${totalMB.toFixed(2)}MB used of ${UPLOAD_CONFIG.uploadDirQuotaMB}MB`
      );
    }
    
    return totalMB;
  } catch (error) {
    if (error.message.includes('quota exceeded')) {
      throw error;
    }
    console.warn('⚠️  Could not check upload quota:', error.message);
    return 0;
  }
}

/**
 * Sanitize filename
 */
function sanitizeFilename(filename) {
  // Remove any path traversal attempts
  let safe = path.basename(filename);
  
  // Remove special characters except alphanumeric, dots, dashes, underscores
  safe = safe.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  
  // Prevent multiple extensions (e.g., file.pdf.exe)
  const ext = path.extname(safe);
  const name = path.basename(safe, ext);
  safe = name.replace(/\./g, '_') + ext;
  
  // Add timestamp and random hash to prevent collisions
  const timestamp = Date.now();
  const hash = crypto.randomBytes(4).toString('hex');
  safe = `${timestamp}_${hash}_${safe}`;
  
  // Limit length
  if (safe.length > 255) {
    const ext = path.extname(safe);
    const name = safe.substring(0, 255 - ext.length);
    safe = name + ext;
  }
  
  return safe;
}

// ============================================
// MULTER CONFIGURATION
// ============================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_CONFIG.tempDir);
  },
  filename: (req, file, cb) => {
    try {
      const safeName = sanitizeFilename(file.originalname);
      cb(null, safeName);
    } catch (error) {
      cb(error);
    }
  },
});

const fileFilter = (req, file, cb) => {
  try {
    validateMimeType(file);
    validateExtension(file.originalname);
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.maxFileSize,
    files: UPLOAD_CONFIG.maxFilesPerRequest,
  },
});

// ============================================
// SECURITY MIDDLEWARE
// ============================================

/**
 * Pre-upload security checks
 */
export async function preUploadChecks(req, res, next) {
  try {
    // Check disk space
    await checkDiskSpace();
    
    // Check upload quota
    checkUploadQuota();
    
    next();
  } catch (error) {
    console.error('❌ Pre-upload check failed:', error.message);
    return res.status(507).json({
      error: 'Upload not allowed',
      message: error.message,
    });
  }
}

/**
 * Post-upload validation and scanning
 */
export async function postUploadValidation(req, res, next) {
  if (!req.files || req.files.length === 0) {
    return next();
  }
  
  try {
    let totalSize = 0;
    const validatedFiles = [];
    
    for (const file of req.files) {
      totalSize += file.size;
      
      // Check total size across all files
      if (totalSize > UPLOAD_CONFIG.maxTotalSize) {
        throw new Error(
          `Total upload size exceeds limit: ${(totalSize / 1024 / 1024).toFixed(2)}MB of ${UPLOAD_CONFIG.maxTotalSize / 1024 / 1024}MB`
        );
      }
      
      // Read file for content validation
      const buffer = fs.readFileSync(file.path);
      
      // Validate file structure based on type
      if (file.mimetype === 'application/pdf') {
        validatePDFStructure(buffer);
      }
      
      // Check for malicious patterns
      checkMaliciousPatterns(buffer);
      
      // Move from temp to final upload directory
      const finalPath = path.join(UPLOAD_CONFIG.uploadDir, file.filename);
      fs.renameSync(file.path, finalPath);
      file.path = finalPath;
      
      validatedFiles.push(file);
      
      console.log(`✅ File validated: ${file.originalname} (${(file.size / 1024).toFixed(2)}KB)`);
    }
    
    req.files = validatedFiles;
    next();
  } catch (error) {
    // Clean up uploaded files on validation failure
    if (req.files) {
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup file:', cleanupError);
        }
      }
    }
    
    console.error('❌ Post-upload validation failed:', error.message);
    return res.status(400).json({
      error: 'File validation failed',
      message: error.message,
    });
  }
}

/**
 * Clean up uploaded file after processing
 */
export function cleanupUploadedFiles(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Clean up files after response is sent
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`🗑️  Cleaned up: ${file.filename}`);
          }
        } catch (error) {
          console.error('Failed to cleanup file:', file.filename, error);
        }
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
}

/**
 * Auto-cleanup old files
 */
export function setupAutoCleanup() {
  if (!UPLOAD_CONFIG.autoCleanupEnabled) {
    return;
  }
  
  const cleanupInterval = UPLOAD_CONFIG.cleanupAfterMinutes * 60 * 1000;
  
  setInterval(() => {
    console.log('🧹 Running auto-cleanup...');
    
    try {
      const now = Date.now();
      const files = fs.readdirSync(UPLOAD_CONFIG.uploadDir);
      let cleaned = 0;
      
      for (const file of files) {
        const filePath = path.join(UPLOAD_CONFIG.uploadDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          const ageMinutes = (now - stats.mtimeMs) / 1000 / 60;
          
          if (ageMinutes > UPLOAD_CONFIG.cleanupAfterMinutes) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        }
      }
      
      if (cleaned > 0) {
        console.log(`✅ Auto-cleanup removed ${cleaned} old files`);
      }
    } catch (error) {
      console.error('❌ Auto-cleanup error:', error);
    }
  }, cleanupInterval);
  
  console.log(`🧹 Auto-cleanup enabled: removing files older than ${UPLOAD_CONFIG.cleanupAfterMinutes} minutes`);
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Multer error handler
 */
export function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size: ${UPLOAD_CONFIG.maxFileSize / 1024 / 1024}MB`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = `Too many files. Maximum: ${UPLOAD_CONFIG.maxFilesPerRequest}`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected field name';
        break;
      default:
        message = err.message;
    }
    
    return res.status(400).json({
      error: 'Upload failed',
      message,
      code: err.code,
    });
  }
  
  next(err);
}

// ============================================
// EXPORTS
// ============================================

export const secureUpload = {
  single: (fieldName) => [
    preUploadChecks,
    upload.single(fieldName),
    postUploadValidation,
    cleanupUploadedFiles,
  ],
  
  array: (fieldName, maxCount) => [
    preUploadChecks,
    upload.array(fieldName, maxCount || UPLOAD_CONFIG.maxFilesPerRequest),
    postUploadValidation,
    cleanupUploadedFiles,
  ],
  
  fields: (fields) => [
    preUploadChecks,
    upload.fields(fields),
    postUploadValidation,
    cleanupUploadedFiles,
  ],
};

export default {
  secureUpload,
  handleMulterError,
  setupAutoCleanup,
  UPLOAD_CONFIG,
};
