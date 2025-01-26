'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import Image from 'next/image';
import {
  Container,
  Typography,
  Box,
  Button,
  IconButton,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Alert,
  CircularProgress,
  Grid2 as Grid,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import CodeIcon from '@mui/icons-material/Code';
import ArchiveIcon from '@mui/icons-material/Archive';
import PersonIcon from '@mui/icons-material/Person';
import ImageIcon from '@mui/icons-material/Image';

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

const MessageItem = React.memo(({ item, removeDate, removeTime, anonymizeSender }: {
  item: CleanedMessage;
  removeDate: boolean;
  removeTime: boolean;
  anonymizeSender: boolean;
}) => {
  const senderName = anonymizeSender ? `User${parseInt(item.sender.replace('User', ''), 10) || 1}` : item.sender;

  return (
      <Box sx={{
        bgcolor: '#121212',
        borderRadius: '8px',
        p: 2,
        mb: 1.5,
        border: '1px solid #1E1E1E',
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateX(4px)',
          boxShadow: '0 4px 12px rgba(0,153,255,0.2)'
        }
      }}>
        <Box sx={{
          display: 'flex',
          gap: 1,
          alignItems: 'center',
          mb: 1,
          flexWrap: 'wrap'
        }}>
          {!removeDate && <Box sx={{
            bgcolor: '#0099ff',
            px: 1,
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 500,
            color: '#fff'
          }}>
            {item.date}
          </Box>}
          {!removeTime && <Box sx={{
            bgcolor: '#1E1E1E',
            px: 1,
            borderRadius: '4px',
            fontSize: '0.75rem',
            color: '#EDEDED'
          }}>
            {item.time}
          </Box>}
          <Typography variant="subtitle2" sx={{
            fontWeight: 700,
            color: '#0099ff',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5
          }}>
            <PersonIcon sx={{ fontSize: '1rem', color: '#0099ff' }}/>
            {senderName}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{
          color: '#EDEDED',
          lineHeight: 1.6,
          pl: 1.5,
          position: 'relative',
          '&:before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 4,
            height: '16px',
            width: '2px',
            bgcolor: '#0099ff',
            borderRadius: '2px'
          }
        }}>
          {item.message}
        </Typography>
      </Box>
  );
});

MessageItem.displayName = 'MessageItem';

function WAScrub() {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [removeDate, setRemoveDate] = useState(true);
  const [removeTime, setRemoveTime] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const theme = useTheme();
  const [anonymizeSender, setAnonymizeSender] = useState(false);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteMediaOmitted, setDeleteMediaOmitted] = useState(false);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
      <Container
          maxWidth="xl"
          sx={{
            height: '100vh',
            bgcolor: '#0A0A0A',
            fontFamily: "'Inter', sans-serif",
            color: '#EDEDED',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 0,
            borderLeft: '1px solid #1E1E1E',
            borderRight: '1px solid #1E1E1E',
            position: 'relative',
            '&:before': {
              content: '""',
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(255,255,255,0.02)',
              pointerEvents: 'none',
              zIndex: 0,
            },
          }}
      >
        {dragActive && (
            <Box
                sx={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  bgcolor: 'rgba(0,0,0,0.95)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  border: '4px dashed rgba(0,153,255,0.5)',
                  pointerEvents: 'none',
                }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <CloudUploadIcon sx={{ fontSize: '3rem', color: '#0099ff', mb: 1 }} />
                <Typography sx={{ color: '#0099ff', fontSize: '1.1rem', fontWeight: 500, textAlign: 'center' }}>
                  Drop files to upload
                </Typography>
              </Box>
            </Box>
        )}

        <Box sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          bgcolor: '#121212',
          py: 3,
          borderBottom: '1px solid #1E1E1E',
          backdropFilter: 'blur(10px)',
        }}>
          <Typography variant="h4" component="h1" align="center" sx={{
            fontWeight: 800,
            letterSpacing: '-0.03em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(45deg, #0099ff 30%, #00ff88 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            <Image
                src="/icon.webp"
                alt="Icon"
                width={48}
                height={48}
                style={{
                  marginRight: '1rem',
                  filter: 'drop-shadow(0 0 8px rgba(0,153,255,0.4))'
                }}
            />
            WAScrub
          </Typography>
        </Box>

        {processedFiles.length === 0 ? (
            <Box
                sx={{
                  border: '2px dashed #333',
                  borderRadius: '12px',
                  padding: 4,
                  mx: 2,
                  transition: 'all 0.3s ease',
                  bgcolor: '#121212',
                  opacity: processing ? 0.7 : 1,
                  pointerEvents: processing ? 'none' : 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: `calc(100vh - 160px)`,
                  mt: 3,
                }}
            >
              <label htmlFor="file-upload" style={{ cursor: 'pointer', textAlign: 'center', display: 'block' }}>
                <input
                    id="file-upload"
                    type="file"
                    accept=".txt, .zip"
                    multiple
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                    disabled={processing}
                    style={{ display: 'none' }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  {processing ? (
                      <>
                        <CircularProgress sx={{ color: '#0099ff' }} />
                        <Typography sx={{ color: '#EDEDED', fontSize: '1rem' }}>
                          Processing Files...
                        </Typography>
                      </>
                  ) : (
                      <>
                        <CloudUploadIcon sx={{
                          fontSize: '3rem',
                          color: '#0099ff',
                          mb: 1,
                          filter: 'drop-shadow(0 0 8px rgba(0,153,255,0.4))'
                        }} />
                        <Typography sx={{
                          color: '#EDEDED',
                          fontSize: '1.1rem',
                          fontWeight: 500,
                          textShadow: '0 0 8px rgba(0,153,255,0.4)'
                        }}>
                          Drag & Drop Files or Click to Browse
                        </Typography>
                        <Typography sx={{
                          fontSize: '0.9rem',
                          color: '#666',
                          textShadow: '0 0 4px rgba(0,153,255,0.2)'
                        }}>
                          Supports multiple TXT and ZIP files
                        </Typography>
                      </>
                  )}
                </Box>
              </label>
            </Box>
        ) : (
            <Box sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              bgcolor: '#0A0A0A',
            }}>
              {error && <Alert severity="error" sx={{
                mx: 2,
                mt: 2,
                bgcolor: '#2D0000',
                border: '1px solid #4A0000',
                color: '#FF9999'
              }}>{error}</Alert>}

              <Grid container sx={{
                height: '100%',
                '& .MuiGrid-item': {
                  borderColor: '#1E1E1E'
                }
              }}>
                <Grid
                    size={{ xs: 12, md: 4 }}
                    sx={{
                      borderRight: { md: '1px solid #1E1E1E' },
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      bgcolor: '#121212',
                    }}
                >
                  <Box sx={{
                    p: 2,
                    borderBottom: '1px solid #1E1E1E',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    bgcolor: '#181818'
                  }}>
                    <Typography variant="h6" sx={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: '#0099ff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1
                    }}>
                      <CloudUploadIcon /> File Manager
                    </Typography>
                    <Box>
                      <Button
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={handleAddFilesClick}
                          size="small"
                          sx={{
                            mr: 1,
                            bgcolor: '#0099ff',
                            '&:hover': { bgcolor: '#007acc' }
                          }}
                      >
                        Add Files
                      </Button>
                      {selectedFiles.size > 0 && (
                          <Button
                              variant="contained"
                              color="error"
                              startIcon={<DeleteIcon />}
                              onClick={() => deleteFiles([...selectedFiles])}
                              size="small"
                              sx={{
                                bgcolor: '#ff4444',
                                '&:hover': { bgcolor: '#cc0000' }
                              }}
                          >
                            Delete ({selectedFiles.size})
                          </Button>
                      )}
                    </Box>
                    <input
                        type="file"
                        accept=".txt, .zip"
                        multiple
                        onChange={(e) => e.target.files && handleFiles(e.target.files)}
                        disabled={processing}
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                    />
                  </Box>

                  <List sx={{
                    flex: 1,
                    overflowY: 'auto',
                    '& .MuiListItem-root': {
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.05)'
                      },
                    }
                  }}>
                    {processedFiles.map((file) => (
                        <ListItem
                            key={file.id}
                            onClick={(e: React.MouseEvent<HTMLDivElement>) => handleFileClick(file.id, e)}
                            sx={{
                              bgcolor: selectedFiles.has(file.id)
                                  ? 'rgba(0,153,255,0.1)'
                                  : currentFileId === file.id
                                      ? 'rgba(255,255,255,0.05)'
                                      : 'transparent',
                              borderLeft: currentFileId === file.id
                                  ? '3px solid #0099ff'
                                  : '3px solid transparent',
                            }}
                            component="div"
                        >
                          <ListItemIcon sx={{ minWidth: 'auto', mr: 1 }}>
                            <DescriptionIcon sx={{ color: '#0099ff' }} />
                          </ListItemIcon>
                          <ListItemText
                              slotProps={{
                                primary: {
                                  sx: {
                                    fontSize: '0.9rem',
                                    color: '#EDEDED',
                                    fontWeight: currentFileId === file.id ? 600 : 400
                                  }
                                }
                              }}
                              primary={`${file.fileName} (${file.cleanedMessages.length})`}
                          />
                          <IconButton
                              edge="end"
                              aria-label="delete"
                              onClick={(e) => { e.stopPropagation(); deleteFiles([file.id]); }}
                              sx={{ color: '#666', '&:hover': { color: '#0099ff' } }}
                          >
                            <CloseIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </ListItem>
                    ))}
                  </List>
                </Grid>

                <Grid
                    size={{ xs: 12, md: 8 }}
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      bgcolor: '#0A0A0A',
                    }}
                >
                  <Box sx={{
                    p: 2,
                    borderBottom: '1px solid #1E1E1E',
                    bgcolor: '#121212',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}>
                    <Box sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: 2,
                      paddingX: 1
                    }}>
                      <Box sx={{
                        display: 'flex',
                        gap: 2,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-start'
                      }}>
                        <FormControlLabel
                            control={
                              <Checkbox
                                  checked={removeDate}
                                  onChange={(e) => setRemoveDate(e.target.checked)}
                                  sx={{
                                    color: '#0099ff',
                                    '&.Mui-checked': {
                                      color: '#0099ff',
                                    },
                                  }}
                              />
                            }
                            label={
                              <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: '#EDEDED',
                                fontSize: '0.9rem'
                              }}>
                                <CalendarMonthOutlinedIcon /> Remove Dates
                              </Box>
                            }
                            sx={{ m: 0 }}
                        />
                        <FormControlLabel
                            control={
                              <Checkbox
                                  checked={removeTime}
                                  onChange={(e) => setRemoveTime(e.target.checked)}
                                  sx={{
                                    color: '#0099ff',
                                    '&.Mui-checked': {
                                      color: '#0099ff',
                                    },
                                  }}
                              />
                            }
                            label={
                              <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: '#EDEDED',
                                fontSize: '0.9rem'
                              }}>
                                <AccessTimeOutlinedIcon /> Remove Times
                              </Box>
                            }
                            sx={{ m: 0 }}
                        />
                        <FormControlLabel
                            control={
                              <Checkbox
                                  checked={anonymizeSender}
                                  onChange={(e) => handleAnonymizeSenderChange(e.target.checked)}
                                  sx={{
                                    color: '#0099ff',
                                    '&.Mui-checked': {
                                      color: '#0099ff',
                                    },
                                  }}
                              />
                            }
                            label={
                              <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: '#EDEDED',
                                fontSize: '0.9rem'
                              }}>
                                <VisibilityOffOutlinedIcon /> Anonymize Senders
                              </Box>
                            }
                            sx={{ m: 0 }}
                        />
                        <FormControlLabel
                            control={
                              <Checkbox
                                  checked={deleteMediaOmitted}
                                  onChange={(e) => setDeleteMediaOmitted(e.target.checked)}
                                  sx={{
                                    color: '#0099ff',
                                    '&.Mui-checked': {
                                      color: '#0099ff',
                                    },
                                  }}
                              />
                            }
                            label={
                              <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                color: '#EDEDED',
                                fontSize: '0.9rem'
                              }}>
                                <ImageIcon sx={{ mr: 0.3 }} /> Hide Media
                              </Box>
                            }
                            sx={{ m: 0 }}
                        />
                      </Box>
                      <Box sx={{
                        display: 'flex',
                        gap: 1,
                        justifyContent: 'flex-start',
                        flexWrap: 'wrap'
                      }}>
                        <Button
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            onClick={downloadCurrentFile}
                            disabled={!currentFile}
                            size="small"
                            sx={{
                              bgcolor: '#0099ff',
                              '&:hover': { bgcolor: '#007acc' }
                            }}
                        >
                          Download TXT
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<CodeIcon />}
                            onClick={downloadCurrentFileAsJson}
                            disabled={!currentFile}
                            size="small"
                            sx={{
                              bgcolor: '#0099ff',
                              '&:hover': { bgcolor: '#007acc' }
                            }}
                        >
                          Export JSON
                        </Button>
                        {selectedFiles.size > 1 && (
                            <Button
                                variant="contained"
                                startIcon={<ArchiveIcon />}
                                onClick={downloadSelectedFilesAsZip}
                                size="small"
                                sx={{
                                  bgcolor: '#0099ff',
                                  '&:hover': { bgcolor: '#007acc' }
                                }}
                            >
                              Bulk Export
                            </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>

                  <List sx={{
                    flex: 1,
                    overflowY: 'auto',
                    px: 2,
                    '&::-webkit-scrollbar': {
                      width: '8px'
                    },
                    '&::-webkit-scrollbar-thumb': {
                      bgcolor: '#0099ff',
                      borderRadius: '4px'
                    }
                  }}>
                    {currentFile?.cleanedMessages
                        .filter(item => !deleteMediaOmitted || !item.isMediaOmitted)
                        .map((item, index) => (
                            <MessageItem
                                key={index}
                                item={item}
                                removeDate={removeDate}
                                removeTime={removeTime}
                                anonymizeSender={anonymizeSender}
                            />
                        ))}
                  </List>
                </Grid>
              </Grid>
            </Box>
        )}
      </Container>
  );
}

WAScrub.displayName = 'WAScrub';

export default WAScrub;