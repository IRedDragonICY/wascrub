'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import Image from 'next/image';

interface CleanedMessage {
  sender: string;
  message: string;
  date: string;
  time: string;
  isMediaOmitted: boolean;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteMediaOmitted, setDeleteMediaOmitted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const processChatText = useCallback((text: string, anonymize: boolean): CleanedMessage[] => {
    const messageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(.+?):\s*(.+)/;
    const messages = text.split('\n').reduce<CleanedMessage[]>((acc, line) => {
      const match = line.trim().match(messageRegex);
      if (match && match[4]) {
        const messageText = match[4].trim();
        return [...acc, {
          sender: match[3],
          message: messageText,
          date: match[1],
          time: match[2],
          isMediaOmitted: messageText === '<Media omitted>'
        }];
      }
      return acc;
    }, []);

    if (anonymize) {
      const senderMap = new Map<string, string>();
      const senders = [...new Set(messages.map(msg => msg.sender))];
      senders.forEach((sender, index) => senderMap.set(sender, `User${index + 1}`));
      return messages.map(msg => ({ ...msg, sender: senderMap.get(msg.sender) || msg.sender }));
    }

    return messages;
  }, []);

  const readFile = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList) => {
    setProcessing(true);
    setError('');
    const newFiles: ProcessedFile[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file);
          const textFiles = Object.values(zip.files).filter(zipFile =>
              !zipFile.dir && zipFile.name.toLowerCase().endsWith('.txt')
          );
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
  }, [currentFileId, anonymizeSender, processChatText, readFile]);

  const handleAddFilesClick = () => {
    fileInputRef.current?.click();
  };


  useEffect(() => {
    setIsMobile(window.innerWidth <= 768);
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);

    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(darkModeMediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    darkModeMediaQuery.addEventListener('change', handler);

    const script = document.createElement('script');
    script.src = "https://kit.fontawesome.com/0293e2391b.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    document.body.appendChild(script);

    const handleWindowDrag = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) setDragActive(true);
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) setDragActive(false);
    };

    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer?.files) await handleFiles(e.dataTransfer.files);
    };

    window.addEventListener('dragover', handleWindowDrag);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('resize', handleResize);
      darkModeMediaQuery.removeEventListener('change', handler);
      document.body.removeChild(script);
      window.removeEventListener('dragover', handleWindowDrag);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleFiles]);


  const handleFileClick = useCallback((id: string, e: React.MouseEvent) => {
    const fileIndex = processedFiles.findIndex(file => file.id === id);
    if (fileIndex === -1) return;

    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (e.ctrlKey || e.metaKey) {
        if (newSelection.has(id)) {
          newSelection.delete(id);
        } else {
          newSelection.add(id);
        }
        setLastClickedIndex(fileIndex);
      } else if (e.shiftKey && lastClickedIndex !== null) {
        newSelection.clear();
        const [start, end] = [Math.min(lastClickedIndex, fileIndex), Math.max(lastClickedIndex, fileIndex)];
        for (let i = start; i <= end; i++) {
          newSelection.add(processedFiles[i].id);
        }
      } else {
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
    return file.cleanedMessages
        .filter(msg => !deleteMediaOmitted || !msg.isMediaOmitted)
        .map(item => {
          const prefix = [
            removeDate ? null : item.date,
            removeTime ? null : item.time
          ].filter(Boolean).join(', ');
          return `${prefix ? `${prefix} - ` : ''}${item.sender}: ${item.message}`;
        }).join('\n');
  }, [removeDate, removeTime, deleteMediaOmitted]);

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

    const filteredMessages = file.cleanedMessages.filter(msg => !deleteMediaOmitted || !msg.isMediaOmitted);
    const jsonContent = JSON.stringify(filteredMessages, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([jsonContent], { type: 'application/json' }));
    link.download = `WAScrub_${file.fileName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentFileId, processedFiles, deleteMediaOmitted]);

  const downloadSelectedFilesAsZip = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    const zip = new JSZip();
    selectedFiles.forEach(fileId => {
      const file = processedFiles.find(f => f.id === fileId);
      if (file) zip.file(`WAScrub_${file.fileName}`, downloadFileContent(file));
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
  }, [currentFile, currentFileId, processedFiles, processChatText]);


  return (
      <div style={styles.container(isDarkMode)}>
        {dragActive && (
            <div style={styles.dragOverlay(isDarkMode)}>
              <div style={styles.uploadContent}>
                <i className="fas fa-cloud-upload-alt" style={styles.uploadIcon(isDarkMode)} />
                <span style={styles.uploadText(isDarkMode)}>Drop files to upload</span>
                <div style={styles.uploadSubtext(isDarkMode)}>Supports multiple TXT and ZIP files</div>
              </div>
            </div>
        )}

        <h1 style={styles.title(isDarkMode)}>
          <Image src="/icon.webp" alt="Icon" width={40} height={40} style={styles.titleIcon} /> WAScrub
        </h1>

        {processedFiles.length === 0 ? (
            <div style={styles.uploadZone(isDarkMode, dragActive, processing)}>
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
        ) : (
            <div style={styles.mainContent()}>
              {error && <div style={styles.errorAlert}>{error}</div>}
              <div style={styles.contentSection(isDarkMode, isMobile)}>
                <div style={styles.sidebar(isDarkMode, isMobile)}>
                  <div style={styles.sidebarHeader}>
                    <h3 style={styles.sidebarTitle(isDarkMode)}>
                      <i className="fas fa-file-upload" style={styles.iconSpacing} />
                      Uploaded Files
                    </h3>
                    <div>
                      <button onClick={handleAddFilesClick} style={styles.addButton}>
                        <i className="fas fa-plus" /> Add Files
                      </button>
                      {selectedFiles.size > 0 && (
                          <button onClick={() => deleteFiles([...selectedFiles])} style={styles.deleteButton}>
                            <i className="fas fa-trash" /> Delete ({selectedFiles.size})
                          </button>
                      )}
                    </div>
                    <input
                        type="file"
                        accept=".txt, .zip"
                        multiple
                        onChange={(e) => e.target.files && handleFiles(e.target.files)}
                        disabled={processing}
                        style={styles.hiddenInput}
                        ref={fileInputRef}
                    />
                  </div>
                  <div style={{...getScrollbarStyle(isDarkMode), ...styles.fileList}}>
                    {processedFiles.map((file) => (
                        <div
                            key={file.id}
                            style={styles.fileItem(isDarkMode, currentFileId === file.id, selectedFiles.has(file.id))}
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

                <div style={styles.previewSection(isDarkMode, isMobile)}>
                  <div style={styles.previewHeader}>
                    <div style={styles.options}>
                      <Checkbox
                          label={<><i className="fas fa-calendar-times" style={styles.iconSpacing} />Remove Dates</>}
                          checked={removeDate}
                          onChange={(e) => setRemoveDate(e.target.checked)}
                          isDark={isDarkMode}
                      />
                      <Checkbox
                          label={<><i className="fas fa-clock" style={styles.iconSpacing} />Remove Times</>}
                          checked={removeTime}
                          onChange={(e) => setRemoveTime(e.target.checked)}
                          isDark={isDarkMode}
                      />
                      <Checkbox
                          label={<><i className="fas fa-user-secret" style={styles.iconSpacing} />Anonymize Senders</>}
                          checked={anonymizeSender}
                          onChange={(e) => handleAnonymizeSenderChange(e.target.checked)}
                          isDark={isDarkMode}
                      />
                      <Checkbox
                          label={<><i className="fas fa-image" style={styles.iconSpacing} />Delete Media Omitted</>}
                          checked={deleteMediaOmitted}
                          onChange={(e) => setDeleteMediaOmitted(e.target.checked)}
                          isDark={isDarkMode}
                      />
                    </div>
                    <div style={styles.downloadButtons}>
                      <button onClick={downloadCurrentFile} style={styles.downloadButton()} disabled={!currentFile}>
                        <i className="fas fa-download" style={styles.iconSpacing} /> Download TXT
                      </button>
                      <button onClick={downloadCurrentFileAsJson} style={styles.downloadButton()} disabled={!currentFile}>
                        <i className="fas fa-file-code" style={styles.iconSpacing} /> Export JSON
                      </button>
                      {selectedFiles.size > 1 && (
                          <button onClick={downloadSelectedFilesAsZip} style={styles.downloadButton()}>
                            <i className="fas fa-file-archive" style={styles.iconSpacing} /> Bulk Export TXT
                          </button>
                      )}
                    </div>
                  </div>
                  <div style={{...getScrollbarStyle(isDarkMode), ...styles.messagesList(isMobile)}}>
                    {currentFile?.cleanedMessages
                        .filter(item => !deleteMediaOmitted || !item.isMediaOmitted)
                        .map((item, index) => (
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
      <input type="checkbox" checked={checked} onChange={onChange} style={styles.checkbox(isDark)} />
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
          <span style={styles.sender(isDark)}>
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
    backgroundColor: isDark ? '#121212' : '#f8f9fa',
    fontFamily: "'Poppins', sans-serif",
    color: isDark ? '#e0e0e0' : '#2d3436',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '20px',
  }),
  dragOverlay: (isDark: boolean): CSSProperties => ({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    border: `4px dashed ${isDark ? '#0099ff' : '#0099ff'}`,
    pointerEvents: 'none',
  }),
  title: (isDark: boolean): CSSProperties => ({
    fontSize: '2.2rem',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#1a1a1a',
    marginBottom: '1.5rem',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 2rem',
  }),
  uploadZone: (isDark: boolean, dragActive: boolean, processing: boolean): CSSProperties => ({
    border: `2px dashed ${isDark ? '#404040' : '#e0e0e0'}`,
    borderRadius: '12px',
    padding: '3rem 2rem',
    margin: '0 2rem',
    transition: 'all 0.3s ease',
    backgroundColor: dragActive ? (isDark ? '#1f1f1f' : '#f0f0f0') : (isDark ? '#1a1a1a' : '#ffffff'),
    opacity: processing ? 0.7 : 1,
    pointerEvents: processing ? 'none' : 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 140px)',
    marginTop: '30px',
  }),
  uploadLabel: { display: 'block', cursor: 'pointer', textAlign: 'center' } as CSSProperties,
  uploadContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' } as CSSProperties,
  mainContent: (): CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0rem',
    height: '100%',
    overflow: 'hidden',
    borderRadius: '12px',
    backgroundColor: 'transparent',
  }),
  contentSection: (_isDark: boolean, isMobile: boolean): CSSProperties => ({
    display: isMobile ? 'flex' : 'grid',
    flexDirection: isMobile ? 'column' : 'row',
    gridTemplateColumns: isMobile ? '1fr' : '320px 1fr',
    gap: '20px',
    height: '100%',
  }),
  sidebar: (isDark: boolean, isMobile: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
    borderRadius: isMobile ? '12px' : '12px',
    padding: '1.5rem',
    boxShadow: isMobile ? '0 4px 6px rgba(0,0,0,0.1)' : '0 4px 6px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginBottom: isMobile ? '20px' : '0',
    maxHeight: isMobile ? '300px' : '100%',
    overflowY: 'auto',
  }),
  fileItem: (isDark: boolean, isCurrent: boolean, isSelected: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    padding: '0.8rem 1rem',
    borderRadius: '8px',
    marginBottom: '0.5rem',
    backgroundColor: isSelected ? (isDark ? '#2d2d2d' : '#f0f0f0') : 'transparent',
    border: isCurrent ? `2px solid ${isDark ? '#0099ff' : '#0099ff'}` : 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  }),
  uploadIcon: (isDark: boolean): CSSProperties => ({
    fontSize: '3rem',
    color: isDark ? '#e0e0e0' : '#0099ff',
    marginBottom: '1rem',
  }),
  fileList: { flex: 1, paddingRight: '0.5rem', overflowY: 'auto', height: '100%' } as CSSProperties,
  previewSection: (isDark: boolean, isMobile: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
    borderRadius: '12px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: isMobile ? '0 4px 6px rgba(0,0,0,0.1)' : '0 4px 6px rgba(0,0,0,0.1)',
    height: '100%',
    overflow: 'auto',
    width: '100%',
    maxHeight: isMobile ? '500px' : '100%',
  }),
  messagesList: (isMobile: boolean): CSSProperties => ({
    flex: 1,
    paddingRight: '1rem',
    marginTop: '1rem',
    overflowY: 'auto',
    height: '100%',
    paddingLeft: isMobile ? '1rem' : '0',
  }),
  message: (isDark: boolean): CSSProperties => ({
    backgroundColor: isDark ? '#2d2d2d' : '#f8f9fa',
    borderRadius: '12px',
    padding: '1.2rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  }),
  titleIcon: { marginRight: '1rem', color: '#0099ff' } as CSSProperties,
  iconSpacing: { marginRight: '0.5rem' } as CSSProperties,
  processingText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '1rem',
  }),
  uploadText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '1.1rem',
    fontWeight: 500,
  }),
  uploadSubtext: (isDark: boolean): CSSProperties => ({
    fontSize: '0.9rem',
    color: isDark ? '#a0a0a0' : '#999',
  }),
  hiddenInput: { display: 'none' } as CSSProperties,
  errorAlert: {
    backgroundColor: '#ffe3e3',
    color: '#ff0000',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    margin: '0 2rem',
  } as CSSProperties,
  sidebarHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  } as CSSProperties,
  sidebarTitle: (isDark: boolean): CSSProperties => ({
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 600,
    color: isDark ? '#e0e0e0' : '#1a1a1a',
  }),
  fileName: (isDark: boolean): CSSProperties => ({
    flex: 1,
    fontSize: '0.9rem',
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
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginLeft: '0.5rem',
    fontSize: '0.85rem',
  } as CSSProperties,
  addButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#0099ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontSize: '0.85rem',
  } as CSSProperties,
  deleteIcon: { background: 'none', border: 'none', padding: '0.25rem', cursor: 'pointer' } as CSSProperties,
  trashIcon: (isDark: boolean): CSSProperties => ({
    fontSize: '0.9rem',
    color: isDark ? '#e0e0e0' : '#666',
  }),
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    gap: '1rem',
    flexDirection: 'column' as React.CSSProperties['flexDirection'],
    padding: '0 1rem',
  },
  options: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  } as CSSProperties,
  option: (isDark: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: isDark ? '#e0e0e0' : '#666',
    fontSize: '0.9rem',
  }),
  checkbox: (isDark: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    accentColor: '#0099ff',
    backgroundColor: isDark ? '#404040' : 'white',
    borderRadius: '4px',
    border: isDark ? '1px solid #555' : '1px solid #ccc',
  }),
  downloadButtons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  } as CSSProperties,
  downloadButton: (): CSSProperties => ({
    padding: '0.6rem 1.2rem',
    backgroundColor: '#0099ff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
  }),
  messageHeader: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'baseline',
    marginBottom: '0.6rem',
    padding: '0 1rem',
  },
  date: (isDark: boolean): CSSProperties => ({
    fontSize: '0.8rem',
    color: isDark ? '#a0a0a0' : '#666',
  }),
  time: (isDark: boolean): CSSProperties => ({
    fontSize: '0.8rem',
    color: isDark ? '#a0a0a0' : '#666',
  }),
  sender: (isDark: boolean): CSSProperties => ({
    fontWeight: 600,
    color: isDark ? '#0099ff' : '#0099ff',
    fontSize: '0.9rem',
  }),
  messageText: (isDark: boolean): CSSProperties => ({
    color: isDark ? '#e0e0e0' : '#333',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    padding: '0 1rem',
    fontSize: '0.9rem',
  }),
  spinner: {
    width: 24,
    height: 24,
    border: '3px solid rgba(0, 153, 255, 0.3)',
    borderTopColor: '#0099ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  } as CSSProperties,
};