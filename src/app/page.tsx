'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import JSZip from 'jszip';
import Image from 'next/image';

interface CleanedMessage {
  sender: string;
  message: string;
  date: string;
  time: string;
}

interface ProcessedFile {
  id: string;
  fileName: string;
  originalText: string;
  cleanedMessages: CleanedMessage[];
}

type CSSProperties = React.CSSProperties;

const getScrollbarStyle = (isDark: boolean): CSSProperties => ({
  flex: 1,
  overflowY: 'auto',
  paddingRight: '0.5rem',
  scrollbarWidth: 'thin',
  scrollbarColor: isDark ? '#4a4a4a #2d2d2d' : '#c1c1c1 #f8f9fa',
});

export default function WAScrub() {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [removeDate, setRemoveDate] = useState(true);
  const [removeTime, setRemoveTime] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [anonymizeSender, setAnonymizeSender] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  useEffect(() => {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    darkModeMediaQuery.addEventListener('change', handler);

    const script = document.createElement('script');
    script.src = "https://kit.fontawesome.com/0293e2391b.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      darkModeMediaQuery.removeEventListener('change', handler);
      document.body.removeChild(script);
    };
  }, []);

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const processChatText = (text: string, anonymize: boolean): CleanedMessage[] => {
    const messageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(.+?):\s*(.*)/;
    const messages = text.split('\n').reduce<CleanedMessage[]>((acc, line) => {
      const match = line.trim().match(messageRegex);
      return match ? [...acc, {
        sender: match[3],
        message: match[4].trim(),
        date: match[1],
        time: match[2]
      }] : acc;
    }, []);

    if (anonymize) {
      const senderMap = new Map<string, string>();
      const senders = [...new Set(messages.map(msg => msg.sender))];
      senders.forEach((sender, index) => {
        senderMap.set(sender, `User${index + 1}`);
      });
      return messages.map(msg => ({ ...msg, sender: senderMap.get(msg.sender) || msg.sender }));
    }

    return messages;
  };

  const handleFiles = useCallback(async (files: FileList) => {
    setProcessing(true);
    setError('');
    const newFiles: ProcessedFile[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file);
          const textFiles = Object.values(zip.files).filter(zipFile => !zipFile.dir && zipFile.name.toLowerCase().endsWith('.txt'));
          for (const textFile of textFiles) {
            const text = await textFile.async('text');
            newFiles.push({
              id: crypto.randomUUID(),
              fileName: textFile.name,
              originalText: text,
              cleanedMessages: processChatText(text, anonymizeSender)
            });
          }
        } else if (file.name.toLowerCase().endsWith('.txt')) {
          const text = await readFile(file);
          newFiles.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            originalText: text,
            cleanedMessages: processChatText(text, anonymizeSender)
          });
        }
      }

      setProcessedFiles(prev => [...prev, ...newFiles]);
      if (!currentFileId && newFiles.length > 0) setCurrentFileId(newFiles[0].id);
    } catch (e) {
      setError('Failed to process files. Ensure they match WhatsApp chat format or valid ZIP.');
      console.error("File processing error:", e);
    } finally {
      setProcessing(false);
    }
  }, [currentFileId, anonymizeSender]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files) await handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileClick = useCallback((id: string, e: React.MouseEvent) => {
    const fileIndex = processedFiles.findIndex(file => file.id === id);
    if (fileIndex === -1) return;

    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        void (newSelection.has(id) ? newSelection.delete(id) : newSelection.add(id));
        setLastClickedIndex(fileIndex);
      } else if (e.shiftKey && lastClickedIndex !== null) {
        newSelection.clear();
        const startIndex = Math.min(lastClickedIndex, fileIndex);
        const endIndex = Math.max(lastClickedIndex, fileIndex);
        for (let i = startIndex; i <= endIndex; i++) {
          newSelection.add(processedFiles[i].id);
        }
      }
      else {
        newSelection.clear();
        newSelection.add(id);
        setLastClickedIndex(fileIndex);
      }
      return newSelection;
    });
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) setCurrentFileId(id);
  }, [processedFiles, lastClickedIndex]);

  const deleteFiles = useCallback((ids: string[]) => {
    setProcessedFiles(prev => {
      const remaining = prev.filter(f => !ids.includes(f.id));
      if (remaining.length > 0 && !remaining.some(f => f.id === currentFileId)) {
        setCurrentFileId(remaining[0].id);
      } else if (remaining.length === 0) setCurrentFileId(null);
      return remaining;
    });
    setSelectedFiles(prev => new Set([...prev].filter(id => !ids.includes(id))));
  }, [currentFileId]);

  const downloadFileContent = useCallback((file: ProcessedFile) => {
    return file.cleanedMessages.map(item => {
      const prefix = [
        removeDate ? null : item.date,
        removeTime ? null : item.time
      ].filter(Boolean).join(', ');
      return `${prefix ? `${prefix} - ` : ''}${item.sender}: ${item.message}`;
    }).join('\n');
  }, [removeDate, removeTime]);


  const downloadCurrentFile = useCallback(() => {
    const file = processedFiles.find(f => f.id === currentFileId);
    if (!file) return;

    const content = downloadFileContent(file);

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    link.download = `WAScrub_${file.fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentFileId, processedFiles, downloadFileContent]);

  const downloadCurrentFileAsJson = useCallback(() => {
    const file = processedFiles.find(f => f.id === currentFileId);
    if (!file) return;

    const jsonContent = JSON.stringify(file.cleanedMessages, null, 2);

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([jsonContent], { type: 'application/json' }));
    link.download = `WAScrub_${file.fileName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentFileId, processedFiles]);

  const downloadSelectedFilesAsZip = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    const zip = new JSZip();
    selectedFiles.forEach(fileId => {
      const file = processedFiles.find(f => f.id === fileId);
      if (file) {
        const content = downloadFileContent(file);
        zip.file(`WAScrub_${file.fileName}`, content);
      }
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `WAScrub_BulkExport.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [processedFiles, selectedFiles, downloadFileContent]);


  const currentFile = useMemo(() =>
          processedFiles.find(f => f.id === currentFileId),
      [currentFileId, processedFiles]
  );

  const handleAnonymizeSenderChange = useCallback((checked: boolean) => {
    setAnonymizeSender(checked);
    if (currentFile) {
      const updatedFiles = processedFiles.map(file =>
          file.id === currentFileId
              ? { ...file, cleanedMessages: processChatText(file.originalText, checked) }
              : file
      );
      setProcessedFiles(updatedFiles);
    }
  }, [currentFile, currentFileId, processedFiles, setAnonymizeSender]);


  return (
      <div style={styles.container(isDarkMode)}>
        <h1 style={styles.title(isDarkMode)}>
          <Image src="/icon.webp" alt="Icon" width={32} height={32} style={styles.titleIcon} /> WAScrub
        </h1>

        <div
            style={styles.uploadZone(isDarkMode, dragActive, processing)}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
        >
          <label style={styles.uploadLabel}>
            <input
                type="file"
                accept=".txt, .zip"
                multiple
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                disabled={processing}
                style={styles.hiddenInput}
            />
            <div style={styles.uploadContent}>
              {processing ? (
                  <>
                    <div style={styles.spinner} />
                    <span style={styles.processingText(isDarkMode)}>Processing Files...</span>
                  </>
              ) : (
                  <>
                    <i className="fas fa-cloud-upload-alt" style={styles.uploadIcon(isDarkMode)} />
                    <span style={styles.uploadText(isDarkMode)}>
                  Drag & Drop Files or Click to Browse
                </span>
                    <div style={styles.uploadSubtext(isDarkMode)}>
                      Supports multiple TXT and ZIP files
                    </div>
                  </>
              )}
            </div>
          </label>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {processedFiles.length > 0 && (
            <div style={styles.mainContent}>
              <div style={styles.sidebar(isDarkMode)}>
                <div style={styles.sidebarHeader}>
                  <h3 style={styles.sidebarTitle(isDarkMode)}>
                    <i className="fas fa-file-upload" style={styles.iconSpacing} />
                    Uploaded Files
                  </h3>
                  {selectedFiles.size > 0 && (
                      <button
                          onClick={() => deleteFiles([...selectedFiles])}
                          style={styles.deleteButton}
                      >
                        <i className="fas fa-trash" /> ({selectedFiles.size})
                      </button>
                  )}
                </div>
                <div style={{...getScrollbarStyle(isDarkMode), ...styles.fileList}}>
                  {processedFiles.map((file) => (
                      <div
                          key={file.id}
                          style={styles.fileItem(
                              isDarkMode,
                              currentFileId === file.id,
                              selectedFiles.has(file.id)
                          )}
                          onClick={(e) => handleFileClick(file.id, e)}
                      >
                  <span style={styles.fileName(isDarkMode)}>
                    <i className="fas fa-file-alt" style={styles.iconSpacing} />
                    {file.fileName} ({file.cleanedMessages.length})
                  </span>
                        <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFiles([file.id]);
                            }}
                            style={styles.deleteIcon}
                        >
                          <i className="fas fa-times" style={styles.trashIcon(isDarkMode)} />
                        </button>
                      </div>
                  ))}
                </div>
              </div>

              <div style={styles.previewSection(isDarkMode)}>
                <div style={styles.previewHeader}>
                  <div style={styles.options}>
                    <Checkbox
                        label={
                          <>
                            <i className="fas fa-calendar-times" style={styles.iconSpacing} />
                            Remove Dates
                          </>
                        }
                        checked={removeDate}
                        onChange={(e) => setRemoveDate(e.target.checked)}
                        isDark={isDarkMode}
                    />
                    <Checkbox
                        label={
                          <>
                            <i className="fas fa-clock" style={styles.iconSpacing} />
                            Remove Times
                          </>
                        }
                        checked={removeTime}
                        onChange={(e) => setRemoveTime(e.target.checked)}
                        isDark={isDarkMode}
                    />
                    <Checkbox
                        label={
                          <>
                            <i className="fas fa-user-secret" style={styles.iconSpacing} />
                            Anonymize Senders
                          </>
                        }
                        checked={anonymizeSender}
                        onChange={(e) => handleAnonymizeSenderChange(e.target.checked)}
                        isDark={isDarkMode}
                    />
                  </div>
                  <div style={styles.downloadButtons}>
                    <button
                        onClick={downloadCurrentFile}
                        style={styles.downloadButton()}
                        disabled={!currentFile}
                    >
                      <i className="fas fa-download" /> Download TXT
                    </button>
                    <button
                        onClick={downloadCurrentFileAsJson}
                        style={styles.downloadButton()}
                        disabled={!currentFile}
                    >
                      <i className="fas fa-file-code" /> Export JSON
                    </button>
                    {selectedFiles.size > 1 && (
                        <button
                            onClick={downloadSelectedFilesAsZip}
                            style={styles.downloadButton()}
                        >
                          <i className="fas fa-file-archive" /> Bulk Export TXT
                        </button>
                    )}
                  </div>
                </div>
                <div style={{...getScrollbarStyle(isDarkMode), ...styles.messagesList}}>
                  {currentFile?.cleanedMessages.map((item, index) => (
                      <MessageItem
                          key={index}
                          item={item}
                          removeDate={removeDate}
                          removeTime={removeTime}
                          isDark={isDarkMode}
                          anonymizeSender={anonymizeSender}
                      />
                  ))}
                </div>
              </div>
            </div>
        )}
      </div>
  );
}

const Checkbox = ({ label, checked, onChange, isDark }: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isDark: boolean;
}) => (
    <label style={styles.option(isDark)}>
      <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          style={styles.checkbox(isDark)}
      />
      {label}
    </label>
);

const MessageItem = ({ item, removeDate, removeTime, isDark, anonymizeSender }: {
  item: CleanedMessage;
  removeDate: boolean;
  removeTime: boolean;
  isDark: boolean;
  anonymizeSender: boolean;
}) => {
  const senderName = anonymizeSender ? `User${parseInt(item.sender.replace('User', ''), 10) || 1}` : item.sender;
  return (
      <div style={styles.message(isDark)}>
        <div style={styles.messageHeader}>
          {!removeDate && <span style={styles.date(isDark)}>{item.date}</span>}
          {!removeTime && <span style={styles.time(isDark)}>{item.time}</span>}
          <span style={styles.sender()}>
        <i className="fas fa-user" style={styles.iconSpacing} />
            {senderName}
      </span>
        </div>
        <div style={styles.messageText(isDark)}>
          <i className="fas fa-comment-dots" style={styles.iconSpacing} />
          {item.message}
        </div>
      </div>
  );
};


const styles = {
  container: (isDark: boolean): CSSProperties => ({
    width: '100vw',
    height: '100vh',
    padding: '2rem',
    backgroundColor: isDark ? '#121212' : '#f8f9fa',
    fontFamily: "'Inter', sans-serif",
    color: isDark ? '#e0e0e0' : '#2d3436',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  }),

  title: (isDark: boolean): CSSProperties => ({
    fontSize: '2.5rem',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#1a1a1a',
    marginBottom: '1rem',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),

  uploadZone: (isDark: boolean, dragActive: boolean, processing: boolean): CSSProperties => ({
    border: `2px dashed ${isDark ? '#404040' : '#e0e0e0'}`,
    borderRadius: '16px',
    padding: '4rem 2rem',
    marginBottom: '1rem',
    transition: 'all 0.3s ease',
    backgroundColor: dragActive
        ? (isDark ? '#1f1f1f' : '#f0f0f0')
        : (isDark ? '#1a1a1a' : '#ffffff'),
    opacity: processing ? 0.7 : 1,
    pointerEvents: processing ? 'none' : 'auto',
  }),

  uploadLabel: {
    display: 'block',
    cursor: 'pointer',
    textAlign: 'center',
  } as CSSProperties,

  uploadContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
  } as CSSProperties,

  mainContent: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: '2rem',
    height: 'calc(100vh - 180px)',
    overflow: 'hidden',
  } as CSSProperties,

  sidebar: (isDark: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
    borderRadius: '16px',
    padding: '1.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
  }),

  fileItem: (isDark: boolean, isCurrent: boolean, isSelected: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    borderRadius: '12px',
    marginBottom: '0.5rem',
    backgroundColor: isSelected
        ? (isDark ? '#2d2d2d' : '#f0f0f0')
        : 'transparent',
    border: isCurrent ? `2px solid ${isDark ? '#0070f3' : '#0070f3'}` : 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  }),

  uploadIcon: (isDark: boolean): CSSProperties => ({
    fontSize: '3.5rem',
    color: isDark ? '#e0e0e0' : '#0070f3',
    marginBottom: '1rem',
  }),

  fileList: {
    flex: 1,
    paddingRight: '0.5rem',
  } as CSSProperties,

  previewSection: (isDark: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
    borderRadius: '16px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    height: '100%',
    overflow: 'auto',
  }),

  messagesList: {
    flex: 1,
    paddingRight: '1rem',
    marginTop: '1rem',
  } as CSSProperties,

  message: (isDark: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#2d2d2d' : '#f8f9fa',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
  }),

  titleIcon: {
    marginRight: '0.8rem',
    color: '#0070f3',
  } as CSSProperties,

  iconSpacing: {
    marginRight: '0.5rem',
  } as CSSProperties,

  processingText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '1.1rem',
  }),

  uploadText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '1.2rem',
    fontWeight: 500,
  }),

  uploadSubtext: (isDark: boolean): CSSProperties => ({
    fontSize: '0.9rem',
    color: isDark ? '#a0a0a0' : '#999',
  }),

  hiddenInput: {
    display: 'none',
  } as CSSProperties,

  errorAlert: {
    backgroundColor: '#ffe3e3',
    color: '#ff0000',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  } as CSSProperties,

  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  } as CSSProperties,

  sidebarTitle: (isDark: boolean): CSSProperties => ({
    margin: 0,
    fontSize: '1.2rem',
    fontWeight: 600,
    color: isDark ? '#e0e0e0' : '#1a1a1a',
  }),

  fileName: (isDark: boolean): CSSProperties => ({
    flex: 1,
    fontSize: '0.95rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: isDark ? '#e0e0e0' : '#1a1a1a',
    userSelect: 'none',
  }),

  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ff4757',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as CSSProperties,

  deleteIcon: {
    background: 'none',
    border: 'none',
    padding: '0.25rem',
    cursor: 'pointer',
  } as CSSProperties,

  trashIcon: (isDark: boolean): CSSProperties => ({
    fontSize: '1rem',
    color: isDark ? '#e0e0e0' : '#666',
  }),

  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    gap: '1rem',
  } as CSSProperties,

  options: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'center',
  } as CSSProperties,

  option: (isDark: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '0.95rem',
  }),

  checkbox: (isDark: boolean): CSSProperties => ({
    width: 18,
    height: 18,
    accentColor: '#0070f3',
    backgroundColor: isDark ? '#404040' : 'white',
    borderRadius: '4px',
  }),

  downloadButtons: {
    display: 'flex',
    gap: '1rem',
  } as CSSProperties,


  downloadButton: (): CSSProperties => ({
    padding: '0.75rem 1.5rem',
    backgroundColor: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'background-color 0.2s',
  }),

  messageHeader: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'baseline',
    marginBottom: '0.75rem',
  } as CSSProperties,

  date: (isDark: boolean): CSSProperties => ({
    fontSize: '0.85rem',
    color: isDark ? '#a0a0a0' : '#666',
  }),

  time: (isDark: boolean): CSSProperties => ({
    fontSize: '0.85rem',
    color: isDark ? '#a0a0a0' : '#666',
  }),

  sender: (): CSSProperties => ({
    fontWeight: 600,
    color: '#0070f3',
    fontSize: '0.95rem',
  }),

  messageText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#333',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
  }),

  spinner: {
    width: 28,
    height: 28,
    border: '3px solid rgba(0, 112, 243, 0.3)',
    borderTopColor: '#0070f3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as CSSProperties,
};