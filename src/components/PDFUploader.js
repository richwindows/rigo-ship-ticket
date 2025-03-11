import React, { useRef, useState } from 'react';

function PDFUploader({ onFileUpload }) {
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      console.log('选择的 PDF 文件:', {
        name: file.name,
        size: `${(file.size / 1024).toFixed(2)} KB`,
        type: file.type,
        lastModified: new Date(file.lastModified).toLocaleString()
      });
      
      setFileName(file.name);
      onFileUpload(file);
    } else {
      console.warn('选择的文件不是有效的 PDF 文件');
      alert('请上传有效的 PDF 文件');
      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFileName('');
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        console.log('拖放的 PDF 文件:', {
          name: file.name,
          size: `${(file.size / 1024).toFixed(2)} KB`,
          type: file.type,
          lastModified: new Date(file.lastModified).toLocaleString()
        });
        
        setFileName(file.name);
        onFileUpload(file);
      } else {
        console.warn('拖放的文件不是有效的 PDF 文件');
        alert('请上传有效的 PDF 文件');
        setFileName('');
      }
    }
  };

  const triggerFileInput = () => {
    console.log('触发文件选择对话框');
    fileInputRef.current.click();
  };

  // 上传区域容器样式
  const containerStyle = {
    marginTop: '1.5rem'
  };

  // 拖放区域样式
  const dropzoneStyle = {
    border: '2px dashed #d1d5db',
    borderRadius: '0.5rem',
    padding: '1.5rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 150ms ease',
    ':hover': {
      borderColor: '#3b82f6'
    }
  };

  // 隐藏输入框样式
  const hiddenInputStyle = {
    display: 'none'
  };

  // 图标样式
  const iconStyle = {
    margin: '0 auto',
    height: '3rem',
    width: '3rem',
    color: '#9ca3af'
  };

  // 文本样式
  const textStyle = {
    marginTop: '0.25rem',
    fontSize: '0.875rem',
    color: '#4b5563'
  };

  return (
    <div style={containerStyle}>
      <div 
        style={dropzoneStyle}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <input
          type="file"
          accept=".pdf"
          style={hiddenInputStyle}
          onChange={handleFileChange}
          ref={fileInputRef}
        />
        <svg 
          style={iconStyle}
          stroke="currentColor" 
          fill="none" 
          viewBox="0 0 48 48" 
          aria-hidden="true"
        >
          <path 
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </svg>
        <p style={textStyle}>
          {fileName ? `已选择: ${fileName}` : '点击或拖拽 PDF 文件到此处上传'}
        </p>
      </div>
    </div>
  );
}

export default PDFUploader; 