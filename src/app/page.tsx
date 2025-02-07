'use client';
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import Image from 'next/image';
import {
  Container, Typography, Box, Button, IconButton, FormControlLabel,
  List, ListItem, ListItemText, ListItemIcon, Alert, CircularProgress,
  Grid2, useMediaQuery, Collapse, AppBar, Toolbar,
  BottomNavigation, BottomNavigationAction, Switch, Paper, Popover,
  MenuList, MenuItem
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import CodeIcon from '@mui/icons-material/Code';
import ArchiveIcon from '@mui/icons-material/Archive';
import PersonIcon from '@mui/icons-material/Person';
import ImageIcon from '@mui/icons-material/Image';
import MenuIcon from '@mui/icons-material/Menu';
import TuneIcon from '@mui/icons-material/Tune';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import { FixedSizeList as VirtualizedList } from 'react-window';

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
  const senderName = anonymizeSender ? `User${parseInt(item.sender, 10) || 1}` : item.sender;
  return (
      <Box sx={{ bgcolor: '#121212', borderRadius: '8px', p: 2, mb: 1.5, border: '1px solid #1E1E1E', transition: 'all 0.2s ease', '&:hover': { transform: 'translateX(4px)', boxShadow: '0 4px 12px rgba(0,153,255,0.2)' } }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
          {!removeDate && <Box sx={{ bgcolor: '#0099ff', px: 1, borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500, color: '#fff' }}>{item.date}</Box>}
          {!removeTime && <Box sx={{ bgcolor: '#1E1E1E', px: 1, borderRadius: '4px', fontSize: '0.75rem', color: '#EDEDED' }}>{item.time}</Box>}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0099ff', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PersonIcon sx={{ fontSize: '1rem' }} />{senderName}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: '#EDEDED', lineHeight: 1.6, pl: 1.5, position: 'relative', '&:before': { content: '""', position: 'absolute', left: 0, top: 4, height: '16px', width: '2px', bgcolor: '#0099ff', borderRadius: '2px' } }}>
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteMediaOmitted, setDeleteMediaOmitted] = useState(false);
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const messageListRef = useRef<VirtualizedList | null>(null);
  const [listHeight, setListHeight] = useState(800);
  const [fileListOpen, setFileListOpen] = useState(false);
  const [bottomNavValue, setBottomNavValue] = useState('options');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportAnchorRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const calculateListHeight = () => {
      setListHeight(window.innerHeight - (isMobile ? 220 : 240));
    };
    calculateListHeight();
    window.addEventListener('resize', calculateListHeight);
    return () => window.removeEventListener('resize', calculateListHeight);
  }, [isMobile]);

  const processChatText = useCallback((text: string, anonymize: boolean): CleanedMessage[] => {
    const messageRegex = /^(\d{1,2}\/\d{1,2}\/\d{2}),\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(.+?):\s*(.+)/;
    const messages = text.split('\n').reduce<CleanedMessage[]>((acc, line) => {
      const match = line.match(messageRegex);
      if (match?.[4]) {
        return [...acc, { sender: match[3], message: match[4].trim(), date: match[1], time: match[2], isMediaOmitted: match[4].trim() === '<Media omitted>' }];
      }
      return acc;
    }, []);

    if (anonymize) {
      const senderMap = new Map<string, string>();
      [...new Set(messages.map(msg => msg.sender))].forEach((sender, index) => {
        senderMap.set(sender, `User${index + 1}`);
      });
      return messages.map(msg => ({ ...msg, sender: senderMap.get(msg.sender) || msg.sender }));
    }
    return messages;
  }, []);

  const readFile = useCallback((file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  }), []);

  const handleFiles = useCallback(async (files: FileList) => {
    setProcessing(true);
    setError('');
    const newFiles: ProcessedFile[] = [];
    try {
      for (const file of files) {
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.zip')) {
          const zip = await JSZip.loadAsync(file);
          const textFiles = Object.values(zip.files).filter(zipFile => !zipFile.dir && zipFile.name.toLowerCase().endsWith('.txt'));
          for (const textFile of textFiles) {
            const text = await textFile.async('text');
            newFiles.push({ id: crypto.randomUUID(), fileName: textFile.name, originalText: text, cleanedMessages: processChatText(text, anonymizeSender) });
          }
        } else if (fileName.endsWith('.txt')) {
          const text = await readFile(file);
          newFiles.push({ id: crypto.randomUUID(), fileName: file.name, originalText: text, cleanedMessages: processChatText(text, anonymizeSender) });
        }
      }
      setProcessedFiles(prev => [...prev, ...newFiles]);
      if (newFiles.length > 0) {
        setCurrentFileId(newFiles[0].id);
      }
    } catch (e) {
      setError('Failed to process files. Ensure they match WhatsApp chat format or valid ZIP.');
      console.error("File processing error:", e);
    } finally {
      setProcessing(false);
    }
  }, [anonymizeSender, processChatText, readFile]);


  const handleAddFilesClick = () => fileInputRef.current?.click();

  useEffect(() => {
    const handleDragEvents = (e: DragEvent) => e.preventDefault();
    const handleWindowDragLeave = (e: DragEvent) => { if (e.clientX === 0 && e.clientY === 0) setDragActive(false); };

    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer?.files) {
        await handleFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener('dragover', handleDragEvents);
    window.addEventListener('dragenter', () => setDragActive(true));
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragover', handleDragEvents);
      window.removeEventListener('dragenter', () => setDragActive(true));
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
        if (newSelection.has(id)) newSelection.delete(id);
        else newSelection.add(id);
      } else if (e.shiftKey && lastClickedIndex !== null) {
        newSelection.clear();
        const [start, end] = [Math.min(lastClickedIndex, fileIndex), Math.max(lastClickedIndex, fileIndex)];
        for (let i = start; i <= end; i++) newSelection.add(processedFiles[i].id);
      } else {
        newSelection.clear();
        newSelection.add(id);
      }
      setLastClickedIndex(fileIndex);
      return newSelection;
    });

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) setCurrentFileId(id);
  }, [processedFiles, lastClickedIndex]);

  const deleteFiles = useCallback((ids: string[]) => {
    setProcessedFiles(prev => {
      const remaining = prev.filter(f => !ids.includes(f.id));
      setCurrentFileId(remaining.length > 0 ? remaining[0].id : null);
      return remaining;
    });
    setSelectedFiles(prev => new Set([...prev].filter(id => !ids.includes(id))));
  }, [setCurrentFileId]);

  const downloadFileContent = useCallback((file: ProcessedFile) => file.cleanedMessages
      .filter(msg => !deleteMediaOmitted || !msg.isMediaOmitted)
      .map(item => {
        const prefix = [removeDate ? null : item.date, removeTime ? null : item.time].filter(Boolean).join(', ');
        return `${prefix ? `${prefix} - ` : ''}${item.sender}: ${item.message}`;
      }).join('\n'), [removeDate, removeTime, deleteMediaOmitted]);

  const downloadCurrentFile = useCallback(() => {
    setIsExportMenuOpen(false);
    const file = processedFiles.find(f => f.id === currentFileId);
    if (!file) return;
    const content = downloadFileContent(file);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    link.download = `WAScrub_${file.fileName}`;
    link.click();
    URL.revokeObjectURL(link.href);

  }, [currentFileId, processedFiles, downloadFileContent]);

  const downloadCurrentFileAsJson = useCallback(() => {
    setIsExportMenuOpen(false);
    const file = processedFiles.find(f => f.id === currentFileId);
    if (!file) return;
    const filteredMessages = file.cleanedMessages.filter(msg => !deleteMediaOmitted || !msg.isMediaOmitted);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(filteredMessages, null, 2)], { type: 'application/json' }));
    link.download = `WAScrub_${file.fileName}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [currentFileId, processedFiles, deleteMediaOmitted]);

  const downloadSelectedFilesAsZip = useCallback(async () => {
    setIsExportMenuOpen(false);
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
    link.click();
    URL.revokeObjectURL(link.href);

  }, [processedFiles, selectedFiles, downloadFileContent]);

  const currentFile = useMemo(() => processedFiles.find(f => f.id === currentFileId), [currentFileId, processedFiles]);

  const handleAnonymizeSenderChange = useCallback((checked: boolean) => {
    setAnonymizeSender(checked);
    setProcessedFiles(prevFiles =>
        prevFiles.map(file =>
            file.id === currentFileId ? { ...file, cleanedMessages: processChatText(file.originalText, checked) } : file
        )
    );
  }, [currentFileId, processChatText]);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = currentFile?.cleanedMessages.find((_, msgIndex) => msgIndex === index && (!deleteMediaOmitted || !_.isMediaOmitted));
    return item ? (
        <ListItem style={style} key={index}>
          <MessageItem item={item} removeDate={removeDate} removeTime={removeTime} anonymizeSender={anonymizeSender} />
        </ListItem>
    ) : null;
  }, [currentFile, removeDate, removeTime, anonymizeSender, deleteMediaOmitted]);

  const memoizedRow = useMemo(() => Row, [Row]);

  const visibleMessagesCount = useMemo(() => currentFile?.cleanedMessages.filter(item => !deleteMediaOmitted || !item.isMediaOmitted).length || 0, [currentFile, deleteMediaOmitted]);

  const renderFileList = () => (
      <Collapse in={!isMobile || fileListOpen} timeout="auto" unmountOnExit sx={{ width: '100%', ...(isMobile && { position: 'absolute', top: '64px', left: 0, zIndex: 1001, bgcolor: '#121212' }) }}>
        <List sx={{ flex: 1, overflowY: 'auto', '& .MuiListItem-root': { transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } } }}>
          {processedFiles.map((file) => (
              <ListItem key={file.id} onClick={(e) => handleFileClick(file.id, e)} sx={{ bgcolor: selectedFiles.has(file.id) ? 'rgba(0,153,255,0.1)' : currentFileId === file.id ? 'rgba(255,255,255,0.05)' : 'transparent', borderLeft: currentFileId === file.id ? '3px solid #0099ff' : '3px solid transparent' }} component="div">
                <ListItemIcon sx={{ minWidth: 'auto', mr: 1 }}><DescriptionIcon sx={{ color: '#0099ff' }} /></ListItemIcon>
                <ListItemText
                    slotProps={{ primary: { fontSize: '0.9rem', color: '#EDEDED', fontWeight: currentFileId === file.id ? 600 : 400 } }}
                    primary="My Text"
                />
                <IconButton edge="end" onClick={(e) => { e.stopPropagation(); deleteFiles([file.id]); }} sx={{ color: '#666', '&:hover': { color: '#0099ff' } }}><CloseIcon sx={{ fontSize: '1rem' }} /></IconButton>
              </ListItem>
          ))}
        </List>
      </Collapse>
  );

  const renderOptionsMobile = () => (
      <Paper elevation={0} sx={{ bgcolor: 'transparent', width: '100%', overflowX: 'auto', whiteSpace: 'nowrap', p: 1, pb: 2 }}>
        <Box display="flex" gap={2} alignItems="center">
          <IconButton onClick={() => setRemoveDate(!removeDate)}><Box display="flex" flexDirection="column" alignItems="center">{removeDate ? <CalendarMonthIcon sx={{ color: '#0099ff' }} /> : <CalendarMonthOutlinedIcon />}<Typography variant="caption" sx={{ color: '#EDEDED', mt: 0.5 }}>Dates</Typography></Box></IconButton>
          <IconButton onClick={() => setRemoveTime(!removeTime)}><Box display="flex" flexDirection="column" alignItems="center">{removeTime ? <AccessTimeIcon sx={{ color: '#0099ff' }} /> : <AccessTimeOutlinedIcon />}<Typography variant="caption" sx={{ color: '#EDEDED', mt: 0.5 }}>Times</Typography></Box></IconButton>
          <IconButton onClick={() => handleAnonymizeSenderChange(!anonymizeSender)}><Box display="flex" flexDirection="column" alignItems="center">{anonymizeSender ? <VisibilityIcon sx={{ color: '#0099ff' }} /> : <VisibilityOffOutlinedIcon />}<Typography variant="caption" sx={{ color: '#EDEDED', mt: 0.5 }}>Names</Typography></Box></IconButton>
          <IconButton onClick={() => setDeleteMediaOmitted(!deleteMediaOmitted)}><Box display="flex" flexDirection="column" alignItems="center">{deleteMediaOmitted ? <ImageIcon sx={{ color: '#0099ff' }} /> : <ImageIcon />}<Typography variant="caption" sx={{ color: '#EDEDED', mt: 0.5 }}>Media</Typography></Box></IconButton>
        </Box>
      </Paper>
  );

  const renderOptionsDesktop = () => (
      <Box sx={{ p: 2, borderBottom: '1px solid #1E1E1E', bgcolor: '#121212', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row', gap: 2, paddingX: 1 }}>
          <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
            <FormControlLabel control={<Switch checked={removeDate} onChange={(e) => setRemoveDate(e.target.checked)} />} label={<Box display="flex" alignItems="center" gap={0.5} color="#EDEDED" fontSize="0.9rem"><CalendarMonthOutlinedIcon /> Remove Dates</Box>} sx={{ m: 0 }} />
            <FormControlLabel control={<Switch checked={removeTime} onChange={(e) => setRemoveTime(e.target.checked)} />} label={<Box display="flex" alignItems="center" gap={0.5} color="#EDEDED" fontSize="0.9rem"><AccessTimeOutlinedIcon /> Remove Times</Box>} sx={{ m: 0 }} />
            <FormControlLabel control={<Switch checked={anonymizeSender} onChange={(e) => handleAnonymizeSenderChange(e.target.checked)} />} label={<Box display="flex" alignItems="center" gap={0.5} color="#EDEDED" fontSize="0.9rem"><VisibilityOffOutlinedIcon /> Anonymize Senders</Box>} sx={{ m: 0 }} />
            <FormControlLabel control={<Switch checked={deleteMediaOmitted} onChange={(e) => setDeleteMediaOmitted(e.target.checked)} />} label={<Box display="flex" alignItems="center" gap={0.5} color="#EDEDED" fontSize="0.9rem"><ImageIcon sx={{ mr: 0.3 }} /> Hide Media</Box>} sx={{ m: 0 }} />
          </Box>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={downloadCurrentFile} disabled={!currentFile} size="small" sx={{ bgcolor: '#0099ff', '&:hover': { bgcolor: '#007acc' } }}>Download TXT</Button>
            <Button variant="contained" startIcon={<CodeIcon />} onClick={downloadCurrentFileAsJson} disabled={!currentFile} size="small" sx={{ bgcolor: '#0099ff', '&:hover': { bgcolor: '#007acc' } }}>Export JSON</Button>
            {selectedFiles.size > 1 && <Button variant="contained" startIcon={<ArchiveIcon />} onClick={downloadSelectedFilesAsZip} size="small" sx={{ bgcolor: '#0099ff', '&:hover': { bgcolor: '#007acc' } }}>Bulk Export</Button>}
          </Box>
        </Box>
      </Box>
  );

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setIsExportMenuOpen(true);
    exportAnchorRef.current = event.currentTarget;
  };

  const handleExportMenuClose = () => setIsExportMenuOpen(false);

  return (
      <Container maxWidth="xl" sx={{ height: '100vh', bgcolor: '#0A0A0A', color: '#EDEDED', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderLeft: '1px solid #1E1E1E', borderRight: '1px solid #1E1E1E', position: 'relative' }}>
        {dragActive && (
            <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, border: '4px dashed rgba(0,153,255,0.5)', pointerEvents: 'none' }}>
              <Box display="flex" flexDirection="column" alignItems="center">
                <CloudUploadIcon sx={{ fontSize: '3rem', color: '#0099ff', mb: 1 }} />
                <Typography sx={{ color: '#0099ff', fontSize: '1.1rem', fontWeight: 500 }}>Drop files to upload</Typography>
              </Box>
            </Box>
        )}

        <AppBar position="sticky" sx={{ zIndex: 1000, bgcolor: '#121212', py: isMobile ? 1 : 2, borderBottom: '1px solid #1E1E1E', backdropFilter: 'blur(10px)' }}>
          <Toolbar>
            <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 800, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', background: 'linear-gradient(45deg, #0099ff 30%, #00ff88 90%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              <Image src="/icon.webp" alt="Icon" width={36} height={36} style={{ marginRight: '0.5rem', filter: 'drop-shadow(0 0 8px rgba(0,153,255,0.4))' }} />
              WAScrub
            </Typography>
            {isMobile && processedFiles.length > 0 && <IconButton color="inherit" onClick={() => setFileListOpen(!fileListOpen)}><MenuIcon /></IconButton>}
          </Toolbar>
          {isMobile && processedFiles.length > 0 && renderFileList()}
        </AppBar>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: '#0A0A0A' }}>
          {error && <Alert severity="error" sx={{ mx: 2, mt: 2, bgcolor: '#2D0000', border: '1px solid #4A0000', color: '#FF9999' }}>{error}</Alert>}

          {processedFiles.length === 0 ? (
              <Box sx={{ border: '2px dashed #333', borderRadius: '12px', padding: 4, mx: 2, transition: 'all 0.3s ease', bgcolor: '#121212', opacity: processing ? 0.7 : 1, pointerEvents: processing ? 'none' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: `calc(100vh - ${isMobile ? '140px' : '160px'})`, mt: 3 }}>
                <label htmlFor="file-upload" style={{ cursor: 'pointer', textAlign: 'center', display: 'block' }}>
                  <input id="file-upload" type="file" accept=".txt, .zip" multiple onChange={(e) => { if (e.target.files) { void handleFiles(e.target.files); } }} disabled={processing} style={{ display: 'none' }} />
                  <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                    {processing ? (
                        <><CircularProgress sx={{ color: '#0099ff' }} /><Typography sx={{ color: '#EDEDED', fontSize: '1rem' }}>Processing Files...</Typography></>
                    ) : (
                        <>
                          <CloudUploadIcon sx={{ fontSize: '3rem', color: '#0099ff', mb: 1, filter: 'drop-shadow(0 0 8px rgba(0,153,255,0.4))' }} />
                          <Typography sx={{ color: '#EDEDED', fontSize: '1.1rem', fontWeight: 500, textShadow: '0 0 8px rgba(0,153,255,0.4)' }}>Drag & Drop Files or Click to Browse</Typography>
                          <Typography sx={{ fontSize: '0.9rem', color: '#666', textShadow: '0 0 4px rgba(0,153,255,0.2)' }}>Supports multiple TXT and ZIP files</Typography>
                        </>
                    )}
                  </Box>
                </label>
              </Box>
          ) : (
              <Grid2 container sx={{ height: '100%', '& .MuiGrid2-item': { borderColor: '#1E1E1E' } }}>
                {!isMobile && (
                    <Grid2 size={{ xs: 12, md: 4 }} sx={{ borderRight: { md: '1px solid #1E1E1E' }, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#121212' }}>
                      <Box sx={{ p: 2, borderBottom: '1px solid #1E1E1E', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#181818' }}>
                        <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: '#0099ff', display: 'flex', alignItems: 'center', gap: 1 }}><CloudUploadIcon /> File Manager</Typography>
                        <Box>
                          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddFilesClick} size="small" sx={{ mr: 1, bgcolor: '#0099ff', '&:hover': { bgcolor: '#007acc' } }}>Add Files</Button>
                          {selectedFiles.size > 0 && <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={() => deleteFiles([...selectedFiles])} size="small" sx={{ bgcolor: '#ff4444', '&:hover': { bgcolor: '#cc0000' } }}>Delete ({selectedFiles.size})</Button>}
                          <input type="file" accept=".txt, .zip" multiple onChange={(e) => { if (e.target.files) { void handleFiles(e.target.files); } }} disabled={processing} style={{ display: 'none' }} ref={fileInputRef} />
                        </Box>
                      </Box>
                      {renderFileList()}
                    </Grid2>
                )}

                <Grid2 size={{ xs: 12, md: isMobile ? 12 : 8 }} sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0A0A0A' }}>
                  {!isMobile && renderOptionsDesktop()}
                  <VirtualizedList height={listHeight} itemCount={visibleMessagesCount} itemSize={80} width="100%" ref={messageListRef} overscanCount={10} style={{ overflowX: 'hidden' }}>
                    {memoizedRow}
                  </VirtualizedList>
                </Grid2>
              </Grid2>
          )}
        </Box>

        {isMobile && processedFiles.length > 0 && (
            <AppBar position="fixed" color="default" sx={{ top: 'auto', bottom: 0, bgcolor: '#181818', borderTop: '1px solid #1E1E1E' }}>
              <Toolbar sx={{ justifyContent: 'space-between' }}>
                <Box>
                  <BottomNavigation value={bottomNavValue} onChange={(_event, newValue) => setBottomNavValue(newValue)} showLabels={false} sx={{ bgcolor: 'transparent' }}>
                    <BottomNavigationAction value="options" icon={<TuneIcon sx={{ color: '#EDEDED' }} />} onClick={() => setBottomNavValue('options')} />
                    <BottomNavigationAction value="files" icon={<DescriptionIcon sx={{ color: '#EDEDED' }} />} onClick={() => setFileListOpen(!fileListOpen)} />
                  </BottomNavigation>
                </Box>
                <Box>
                  <IconButton onClick={handleExportMenuOpen} disabled={!currentFile} sx={{ color: '#EDEDED' }} ref={exportAnchorRef}>
                    <ImportExportIcon sx={{ color: currentFile ? '#0099ff' : '#666' }} />
                  </IconButton>
                  <Popover
                      open={isExportMenuOpen}
                      anchorEl={exportAnchorRef.current}
                      onClose={handleExportMenuClose}
                      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                      transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      slotProps={{ paper: { sx: { bgcolor: '#181818', color: '#EDEDED', border: '1px solid #1E1E1E' } } }}
                  >
                    <MenuList>
                      <MenuItem onClick={downloadCurrentFile} disabled={!currentFile}><ListItemIcon><DownloadIcon sx={{ color: '#0099ff' }} /></ListItemIcon><ListItemText>Download TXT</ListItemText></MenuItem>
                      <MenuItem onClick={downloadCurrentFileAsJson} disabled={!currentFile}><ListItemIcon><CodeIcon sx={{ color: '#0099ff' }} /></ListItemIcon><ListItemText>Export JSON</ListItemText></MenuItem>
                      {selectedFiles.size > 1 && <MenuItem onClick={downloadSelectedFilesAsZip}><ListItemIcon><ArchiveIcon sx={{ color: '#0099ff' }} /></ListItemIcon><ListItemText>Bulk Export ZIP</ListItemText></MenuItem>}
                    </MenuList>
                  </Popover>
                </Box>
              </Toolbar>
              {bottomNavValue === 'options' && renderOptionsMobile()}
            </AppBar>
        )}
      </Container>
  );
}

WAScrub.displayName = 'WAScrub';

export default WAScrub;