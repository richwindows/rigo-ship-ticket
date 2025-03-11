import React, { useState } from 'react';
import DataExtractor from './components/DataExtractor';
import DataPreview from './components/DataPreview';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

function App() {
  const [pdfFiles, setPdfFiles] = useState([]);
  const [extractedData, setExtractedData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedData, setSelectedData] = useState([]);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);

  // 处理文件上传 - 支持多文件
  const handleFileChange = (event) => {
    const files = Array.from(event.target.files).filter(file => file.type === 'application/pdf');
    
    if (files.length === 0) {
      setError('请上传有效的PDF文件');
      return;
    }
    
    // 添加新文件到列表
    setPdfFiles(prevFiles => [...prevFiles, ...files]);
    
    // 将新文件添加到处理队列
    setProcessingQueue(prevQueue => [...prevQueue, ...files.map(file => ({
      file,
      processed: false
    }))]);
    
    setError(null);
  };

  // 处理数据提取完成
  const handleDataExtracted = (data, fileName) => {
    if (data && data.products && data.products.length > 0) {
      // 为每个产品添加来源文件名
      const productsWithSource = data.products.map(product => ({
        ...product,
        source: fileName
      }));
      
      // 使用函数式更新，确保基于最新状态更新
      setExtractedData(prevData => {
        // 检查是否已经存在来自同一文件的数据
        const existingFileData = prevData.filter(item => item.source === fileName);
        
        // 如果已经存在来自该文件的数据，则不添加
        if (existingFileData.length > 0) {
          console.log(`数据来自文件 ${fileName} 已存在，不重复添加`);
          return prevData;
        }
        
        console.log(`添加来自文件 ${fileName} 的 ${productsWithSource.length} 条数据`);
        return [...prevData, ...productsWithSource];
      });
    }
    
    // 更新队列中的文件状态
    setProcessingQueue(prevQueue => 
      prevQueue.map((item, index) => 
        index === currentProcessingIndex 
          ? { ...item, processed: true } 
          : item
      )
    );
    
    // 重置当前处理索引，允许处理下一个文件
    setCurrentProcessingIndex(-1);
  };

  // 处理选中数据变化
  const handleSelectionChange = (selected) => {
    setSelectedData(selected);
    console.log('选中的数据:', selected);
  };

  // 处理导出选中数据
  const handleExportSelected = async () => {
    if (selectedData.length === 0) {
      alert('请先选择要导出的数据');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      // 加载Excel模板
      const response = await fetch('/templates/ship_ticket_template.xlsx');
      if (!response.ok) {
        throw new Error('无法加载Excel模板，请确保templates目录下有ship_ticket_template.xlsx文件');
      }
      
      const templateData = await response.arrayBuffer();
      
      // 创建工作簿
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateData);
      
      // 获取工作表
      const worksheet = workbook.getWorksheet(1);
      if (!worksheet) {
        throw new Error('Excel模板中没有找到工作表');
      }
      
      // 从第9行开始填充数据（根据图片显示）
      const startRow = 9;
      const endRow = 23; // 模板中的最后一行数据
      const signatureRow = 24; // 签名行开始的行号，我们不会修改这一行及之后的内容
      
      // 保存原始的合并单元格信息
      const originalMerges = [];
      if (worksheet.mergeCells) {
        // 遍历所有合并单元格并保存
        Object.keys(worksheet.mergeCells).forEach(mergeKey => {
          const mergeRange = worksheet.mergeCells[mergeKey];
          originalMerges.push({
            top: mergeRange.top,
            left: mergeRange.left,
            bottom: mergeRange.bottom,
            right: mergeRange.right,
            address: mergeKey
          });
        });
        
        // 先解除所有合并单元格，以便后续操作
        originalMerges.forEach(range => {
          try {
            worksheet.unMergeCells(range.top, range.left, range.bottom, range.right);
          } catch (e) {
            console.warn(`无法解除合并单元格 ${range.address}:`, e);
          }
        });
      }
      
      // 计算需要添加的行数
      const dataLength = selectedData.length;
      const availableRows = endRow - startRow + 1;
      const needToAddRows = dataLength > availableRows ? dataLength - availableRows : 0;
      
      // 如果数据超过了可用行数，需要在模板中插入新行
      if (needToAddRows > 0) {
        console.log(`数据超过可用行数，需要插入 ${needToAddRows} 行`);
        
        // 获取最后一行的样式作为模板
        const templateRowIndex = endRow;
        const templateRow = worksheet.getRow(templateRowIndex);
        
        // 保存签名行的所有合并单元格信息
        const signatureRowMerges = [];
        if (worksheet.mergeCells) {
          // 找出签名行的所有合并单元格
          Object.keys(worksheet.mergeCells).forEach(mergeKey => {
            const mergeRange = worksheet.mergeCells[mergeKey];
            if (mergeRange.top === signatureRow) {
              signatureRowMerges.push({
                top: mergeRange.top,
                left: mergeRange.left,
                bottom: mergeRange.bottom,
                right: mergeRange.right,
                address: mergeKey
              });
            }
          });
        }
        
        // 先解除所有合并单元格，以便后续操作
        originalMerges.forEach(range => {
          try {
            worksheet.unMergeCells(range.top, range.left, range.bottom, range.right);
          } catch (e) {
            console.warn(`无法解除合并单元格 ${range.address}:`, e);
          }
        });
        
        // 保存签名行的完整信息
        const signatureRowData = {
          cells: [],
          height: worksheet.getRow(signatureRow).height
        };
        
        // 获取签名行的所有单元格信息
        const signRow = worksheet.getRow(signatureRow);
        signRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          signatureRowData.cells.push({
            colNumber,
            value: cell.value,
            style: cell.style ? JSON.parse(JSON.stringify(cell.style)) : null,
            border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : null,
            font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : null,
            alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : null,
            fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : null,
            numFmt: cell.numFmt || null
          });
        });
        
        // 如果没有找到任何单元格，尝试获取所有可能的列
        if (signatureRowData.cells.length === 0) {
          // 获取工作表的最大列数
          const maxCol = worksheet.columnCount || 20;
          for (let col = 1; col <= maxCol; col++) {
            const cell = signRow.getCell(col);
            signatureRowData.cells.push({
              colNumber: col,
              value: cell.value,
              style: cell.style ? JSON.parse(JSON.stringify(cell.style)) : null,
              border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : null,
              font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : null,
              alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : null,
              fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : null,
              numFmt: cell.numFmt || null
            });
          }
        }
        
        // 先将endRow之后的内容下移
        // 从最后一行开始向上移动，以避免覆盖
        const lastRowNum = worksheet.lastRow ? worksheet.lastRow.number : endRow;
        
        // 从底部开始向上移动行，以避免数据覆盖
        for (let i = lastRowNum; i > endRow; i--) {
          // 获取源行和目标行
          const sourceRow = worksheet.getRow(i);
          const targetRow = worksheet.getRow(i + needToAddRows);
          
          // 获取源行的所有单元格（包括空单元格）
          const sourceCells = [];
          sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            sourceCells.push({ colNumber, cell });
          });
          
          // 如果没有找到任何单元格，尝试获取所有可能的列
          if (sourceCells.length === 0) {
            // 获取工作表的最大列数
            const maxCol = worksheet.columnCount || 20; // 增加默认检查列数到20
            for (let col = 1; col <= maxCol; col++) {
              const cell = sourceRow.getCell(col);
              sourceCells.push({ colNumber: col, cell });
            }
          }
          
          // 复制行高
          if (sourceRow.height) {
            targetRow.height = sourceRow.height;
          }
          
          // 复制所有单元格内容和样式
          sourceCells.forEach(({ colNumber, cell }) => {
            const targetCell = targetRow.getCell(colNumber);
            
            // 复制值
            targetCell.value = cell.value;
            
            // 复制样式
            if (cell.style) {
              targetCell.style = JSON.parse(JSON.stringify(cell.style));
            }
            
            // 复制边框
            if (cell.border) {
              targetCell.border = JSON.parse(JSON.stringify(cell.border));
            }
            
            // 复制字体
            if (cell.font) {
              targetCell.font = JSON.parse(JSON.stringify(cell.font));
            }
            
            // 复制对齐方式
            if (cell.alignment) {
              targetCell.alignment = JSON.parse(JSON.stringify(cell.alignment));
            }
            
            // 复制填充
            if (cell.fill) {
              targetCell.fill = JSON.parse(JSON.stringify(cell.fill));
            }
            
            // 复制数字格式
            if (cell.numFmt) {
              targetCell.numFmt = cell.numFmt;
            }
            
            // 复制合并单元格信息
            if (cell.isMerged) {
              // 注意：这里不直接处理合并，因为ExcelJS会在工作簿级别处理合并
              // 只需确保值和样式被复制即可
            }
          });
          
          // 提交目标行
          targetRow.commit();
        }
        
        // 现在插入新行并设置样式
        for (let i = 1; i <= needToAddRows; i++) {
          const newRowIndex = endRow + i;
          const newRow = worksheet.getRow(newRowIndex);
          
          // 获取模板行的所有单元格（包括空单元格）
          const templateCells = [];
          templateRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            templateCells.push({ colNumber, cell });
          });
          
          // 如果没有找到任何单元格，尝试获取所有可能的列
          if (templateCells.length === 0) {
            // 获取工作表的最大列数
            const maxCol = worksheet.columnCount || 20; // 增加默认检查列数到20
            for (let col = 1; col <= maxCol; col++) {
              const cell = templateRow.getCell(col);
              templateCells.push({ colNumber: col, cell });
            }
          }
          
          // 设置行高
          newRow.height = templateRow.height;
          
          // 复制所有单元格样式
          templateCells.forEach(({ colNumber, cell }) => {
            const newCell = newRow.getCell(colNumber);
            
            // 清除值但保留样式
            newCell.value = null;
            
            // 复制样式
            if (cell.style) {
              newCell.style = JSON.parse(JSON.stringify(cell.style));
            }
            
            // 复制边框
            if (cell.border) {
              newCell.border = JSON.parse(JSON.stringify(cell.border));
            }
            
            // 复制字体
            if (cell.font) {
              newCell.font = JSON.parse(JSON.stringify(cell.font));
            }
            
            // 设置居中对齐（无论模板单元格是否有对齐设置）
            newCell.alignment = {
              vertical: 'middle',    // 垂直居中
              horizontal: 'center',  // 水平居中
              wrapText: true         // 允许文本换行
            };
            
            // 复制填充
            if (cell.fill) {
              newCell.fill = JSON.parse(JSON.stringify(cell.fill));
            }
            
            // 复制数字格式
            if (cell.numFmt) {
              newCell.numFmt = cell.numFmt;
            }
          });
          
          // 提交新行
          newRow.commit();
        }
        
        // 重新应用合并单元格
        if (originalMerges.length > 0) {
          originalMerges.forEach(range => {
            try {
              // 如果合并单元格在signatureRow之后或等于signatureRow，需要调整位置
              if (range.top >= signatureRow && needToAddRows > 0) {
                const newTop = range.top + needToAddRows;
                const newBottom = range.bottom + needToAddRows;
                worksheet.mergeCells(newTop, range.left, newBottom, range.right);
              } else {
                // 否则保持原位置
                worksheet.mergeCells(range.top, range.left, range.bottom, range.right);
              }
            } catch (e) {
              console.warn(`无法重新应用合并单元格 ${range.address}:`, e);
            }
          });
        }
        
        // 恢复移动后的签名行的原始格式和内容
        const newSignatureRow = signatureRow + needToAddRows;
        const newSignRow = worksheet.getRow(newSignatureRow);
        
        // 设置行高
        if (signatureRowData.height) {
          newSignRow.height = signatureRowData.height;
        }
        
        // 恢复所有单元格的值和样式
        signatureRowData.cells.forEach(cellData => {
          const cell = newSignRow.getCell(cellData.colNumber);
          
          // 恢复值
          cell.value = cellData.value;
          
          // 恢复样式
          if (cellData.style) {
            cell.style = cellData.style;
          }
          
          // 恢复边框
          if (cellData.border) {
            cell.border = cellData.border;
          }
          
          // 恢复字体
          if (cellData.font) {
            cell.font = cellData.font;
          }
          
          // 恢复对齐方式
          if (cellData.alignment) {
            cell.alignment = cellData.alignment;
          }
          
          // 恢复填充
          if (cellData.fill) {
            cell.fill = cellData.fill;
          }
          
          // 恢复数字格式
          if (cellData.numFmt) {
            cell.numFmt = cellData.numFmt;
          }
        });
        
        // 提交签名行
        newSignRow.commit();
        
        // 重新应用签名行的合并单元格
        signatureRowMerges.forEach(range => {
          try {
            const newTop = range.top + needToAddRows;
            const newBottom = range.bottom + needToAddRows;
            worksheet.mergeCells(newTop, range.left, newBottom, range.right);
          } catch (e) {
            console.warn(`无法重新应用签名行合并单元格:`, e);
          }
        });
      }
      
      // 填充数据
      selectedData.forEach((item, index) => {
        const rowIndex = startRow + index; // 从第9行开始填充
        
        // 创建或获取行
        let row = worksheet.getRow(rowIndex);
        
        // 获取行中所有单元格的当前样式
        const cellStyles = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cellStyles[colNumber] = {
            border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : null,
            font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : null,
            fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : null,
            numFmt: cell.numFmt || null,
            alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : null,
            isMerged: cell.isMerged || false
          };
        });
        
        // 只填充前三列数据并设置居中对齐
        // 注意：我们只修改需要填充数据的列，不影响其他列
        for (let colIndex = 1; colIndex <= 3; colIndex++) {
          const cell = row.getCell(colIndex);
          
          // 保存原始样式
          const originalStyle = cellStyles[colIndex] || {};
          
          // 如果单元格是合并单元格的一部分，且不是合并单元格的左上角，则跳过
          if (originalStyle.isMerged && !cell.isMergedTo) {
            continue;
          }
          
          // 设置单元格值
          if (colIndex === 1) {
            cell.value = item['Product or service'] || ''; // 第1列: Item
          } else if (colIndex === 2) {
            cell.value = item['Description'] || '';        // 第2列: Description
          } else if (colIndex === 3) {
            cell.value = item['Qty'] || '';                // 第3列: Order Qty
          }
          
          // 设置水平和垂直居中对齐
          cell.alignment = {
            vertical: 'middle',    // 垂直居中
            horizontal: 'center',  // 水平居中
            wrapText: true         // 允许文本换行
          };
          
          // 恢复单元格的其他样式
          if (originalStyle.border) {
            cell.border = originalStyle.border;
          }
          if (originalStyle.font) {
            cell.font = originalStyle.font;
          }
          if (originalStyle.fill) {
            cell.fill = originalStyle.fill;
          }
          if (originalStyle.numFmt) {
            cell.numFmt = originalStyle.numFmt;
          }
        }
        
        // 提交行
        row.commit();
      });
      
      // 导出工作簿
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, 'rigo-ship-ticket.xlsx');
      
      // 显示成功消息
      alert(`已成功导出 ${selectedData.length} 条数据到Excel模板`);
      
      setIsLoading(false);
    } catch (error) {
      console.error('导出错误:', error);
      setError(`导出失败: ${error.message}`);
      setIsLoading(false);
    }
  };

  // 移除文件
  const handleRemoveFile = (index) => {
    // 移除文件
    setPdfFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
    
    // 移除队列中的文件
    setProcessingQueue(prevQueue => prevQueue.filter((_, i) => i !== index));
    
    // 如果移除的是当前正在处理的文件，重置处理索引
    if (index === currentProcessingIndex) {
      setCurrentProcessingIndex(-1);
    } else if (index < currentProcessingIndex) {
      // 如果移除的文件在当前处理文件之前，调整索引
      setCurrentProcessingIndex(prev => prev - 1);
    }
    
    // 移除与该文件相关的提取数据
    const fileName = pdfFiles[index].name;
    setExtractedData(prevData => prevData.filter(item => item.source !== fileName));
  };

  // 清除所有数据
  const handleClearAll = () => {
    setPdfFiles([]);
    setExtractedData([]);
    setSelectedData([]);
    setProcessingQueue([]);
    setCurrentProcessingIndex(-1);
    setError(null);
  };

  // 处理下一个文件
  const processNextFile = React.useCallback(() => {
    // 查找队列中下一个未处理的文件
    const nextIndex = processingQueue.findIndex(item => !item.processed);
    
    if (nextIndex !== -1) {
      setCurrentProcessingIndex(nextIndex);
    }
  }, [processingQueue]);

  // 当队列或当前处理索引变化时，检查是否需要处理下一个文件
  React.useEffect(() => {
    if (currentProcessingIndex === -1 && !isLoading && processingQueue.some(item => !item.processed)) {
      processNextFile();
    }
  }, [processingQueue, currentProcessingIndex, isLoading, processNextFile]);

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Rigo Ship Ticket</h1>
        <p style={subtitleStyle}>上传PDF发票，提取并导出送货单数据</p>
      </header>

      <main style={mainStyle}>
        <div style={uploadSectionStyle}>
          <label htmlFor="pdf-upload" style={uploadLabelStyle}>
            选择PDF文件（可多选）
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              multiple
              style={fileInputStyle}
            />
          </label>
          
          {pdfFiles.length > 0 && (
            <div style={fileListStyle}>
              <div style={fileListHeaderStyle}>
                <h3 style={fileListTitleStyle}>已上传文件 ({pdfFiles.length})</h3>
                <button 
                  onClick={handleClearAll}
                  style={clearButtonStyle}
                >
                  清除全部
                </button>
              </div>
              
              {pdfFiles.map((file, index) => (
                <div key={index} style={fileItemStyle}>
                  <span style={fileNameStyle}>{file.name}</span>
                  <span style={fileStatusStyle}>
                    {currentProcessingIndex === index ? '处理中...' : 
                     processingQueue[index]?.processed ? '已处理' : '等待处理'}
                  </span>
                  <button 
                    onClick={() => handleRemoveFile(index)}
                    style={removeButtonStyle}
                    disabled={currentProcessingIndex === index}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        {currentProcessingIndex !== -1 && (
          <DataExtractor
            pdfFile={processingQueue[currentProcessingIndex]?.file}
            onDataExtracted={(data) => handleDataExtracted(data, processingQueue[currentProcessingIndex]?.file.name)}
            setIsLoading={setIsLoading}
            setError={setError}
          />
        )}

        {isLoading && (
          <div style={loadingStyle}>
            <div style={spinnerStyle}></div>
            <p>正在处理PDF文件，请稍候...</p>
          </div>
        )}

        {extractedData.length > 0 && (
          <>
            <DataPreview 
              data={extractedData} 
              onSelectionChange={handleSelectionChange}
            />
            
            <div style={actionBarStyle}>
              <div style={exportInfoStyle}>
                <p>选中的数据将被导出到Excel模板中的表格区域（从第9行开始）</p>
                <p>如果数据超过模板中的可用行数，将自动在签名区域之前插入新行</p>
                <p>签名区域将保持原样，只会整体向下移动</p>
                <p>请确保在public/templates目录下放置了ship_ticket_template.xlsx模板文件</p>
              </div>
              <button 
                style={exportButtonStyle}
                onClick={handleExportSelected}
                disabled={selectedData.length === 0}
              >
                导出选中项 ({selectedData.length})
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// 样式定义
const containerStyle = {
  maxWidth: '800px',
  margin: '0 auto',
  padding: '2rem 1rem'
};

const headerStyle = {
  textAlign: 'center',
  marginBottom: '2rem'
};

const titleStyle = {
  fontSize: '2rem',
  fontWeight: '700',
  color: '#1e3a8a',
  marginBottom: '0.5rem'
};

const subtitleStyle = {
  fontSize: '1rem',
  color: '#6b7280'
};

const mainStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '0.5rem',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  padding: '1.5rem'
};

const uploadSectionStyle = {
  marginBottom: '1.5rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
};

const uploadLabelStyle = {
  display: 'inline-block',
  padding: '0.75rem 1.5rem',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontWeight: '500',
  transition: 'background-color 0.2s ease',
  textAlign: 'center'
};

const fileInputStyle = {
  display: 'none'
};

const fileListStyle = {
  width: '100%',
  marginTop: '1.5rem',
  border: '1px solid #e5e7eb',
  borderRadius: '0.375rem',
  overflow: 'hidden'
};

const fileListHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  backgroundColor: '#f9fafb',
  borderBottom: '1px solid #e5e7eb'
};

const fileListTitleStyle = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: '600',
  color: '#4b5563'
};

const clearButtonStyle = {
  padding: '0.25rem 0.5rem',
  backgroundColor: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const fileItemStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '0.875rem'
};

const fileNameStyle = {
  flex: '1',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginRight: '1rem'
};

const fileStatusStyle = {
  color: '#6b7280',
  marginRight: '1rem'
};

const removeButtonStyle = {
  padding: '0.25rem 0.5rem',
  backgroundColor: '#ef4444',
  color: '#ffffff',
  border: 'none',
  borderRadius: '0.25rem',
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const errorStyle = {
  backgroundColor: '#fee2e2',
  color: '#b91c1c',
  padding: '0.75rem',
  borderRadius: '0.375rem',
  marginBottom: '1.5rem'
};

const loadingStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  color: '#4b5563'
};

const spinnerStyle = {
  border: '4px solid rgba(0, 0, 0, 0.1)',
  borderLeft: '4px solid #3b82f6',
  borderRadius: '50%',
  width: '2rem',
  height: '2rem',
  animation: 'spin 1s linear infinite',
  marginBottom: '1rem'
};

const actionBarStyle = {
  marginTop: '1.5rem',
  display: 'flex',
  justifyContent: 'flex-end'
};

const exportButtonStyle = {
  padding: '0.5rem 1rem',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  border: 'none',
  borderRadius: '0.375rem',
  fontWeight: '500',
  cursor: 'pointer',
  transition: 'background-color 0.2s ease'
};

const exportInfoStyle = {
  flex: '1',
  fontSize: '0.875rem',
  color: '#6b7280',
  lineHeight: '1.25rem'
};

export default App; 