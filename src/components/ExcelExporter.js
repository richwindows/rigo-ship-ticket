import React from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

function ExcelExporter({ data }) {
  // 在组件加载时在控制台显示数据
  React.useEffect(() => {
    console.log('准备导出到 Excel 的数据:', data);
  }, [data]);

  const exportToExcel = () => {
    try {
      console.log('开始导出到 Excel...');
      console.log('导出的数据:', data);
      
      // 创建一个新的工作簿
      const workbook = XLSX.utils.book_new();
      
      // 将数据转换为工作表
      const worksheet = XLSX.utils.json_to_sheet([data]);
      
      // 将工作表添加到工作簿
      XLSX.utils.book_append_sheet(workbook, worksheet, "提取数据");
      
      // 生成 Excel 文件并下载
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
      saveAs(blob, "提取的数据.xlsx");
      
      console.log('Excel 导出成功!');
    } catch (error) {
      console.error("导出 Excel 时出错:", error);
      alert("导出 Excel 时出错: " + error.message);
    }
  };

  // 容器样式
  const containerStyle = {
    marginTop: '1.5rem'
  };

  // 标题样式
  const titleStyle = {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.75rem'
  };

  // 数据显示区域样式
  const dataDisplayStyle = {
    backgroundColor: '#f9fafb',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem'
  };

  // 预格式化文本样式
  const preStyle = {
    whiteSpace: 'pre-wrap'
  };

  // 按钮样式
  const buttonStyle = {
    width: '100%',
    backgroundColor: '#2563eb',
    color: 'white',
    fontWeight: 'bold',
    padding: '0.5rem 1rem',
    borderRadius: '0.25rem',
    outline: 'none',
    transition: 'background-color 150ms ease',
    cursor: 'pointer'
  };

  // 按钮悬停效果
  const handleMouseOver = (e) => {
    e.target.style.backgroundColor = '#1d4ed8';
  };

  const handleMouseOut = (e) => {
    e.target.style.backgroundColor = '#2563eb';
  };

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>提取的数据</h2>
      <div style={dataDisplayStyle}>
        <pre style={preStyle}>{JSON.stringify(data, null, 2)}</pre>
      </div>
      <button
        onClick={exportToExcel}
        style={buttonStyle}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
      >
        导出到 Excel
      </button>
    </div>
  );
}

export default ExcelExporter; 