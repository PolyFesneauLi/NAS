import os
from collections import defaultdict

def count_file_extensions(start_path="."):
    """
    统计当前文件夹及子文件夹中所有文件的后缀名
    
    :param start_path: 起始路径，默认为当前目录
    :return: 包含后缀统计结果的字典
    """
    extension_counts = defaultdict(int)
    total_files = 0

    for root, dirs, files in os.walk(start_path):
        for file in files:
            # 分割文件名和扩展名
            _, ext = os.path.splitext(file)
            # 统一转为小写并统计
            ext = ext.lower() if ext else "无后缀"
            extension_counts[ext] += 1
            total_files += 1

    return extension_counts, total_files

def print_extension_stats(extension_counts, total_files):
    """打印统计结果"""
    print("\n文件后缀统计结果：")
    print("=" * 40)
    print(f"{'后缀':<10} | {'数量':<6} | {'占比':<6}")
    print("-" * 40)
    
    # 按数量降序排序
    sorted_extensions = sorted(extension_counts.items(), key=lambda x: x[1], reverse=True)
    
    for ext, count in sorted_extensions:
        percentage = (count / total_files) * 100
        print(f"{ext:<10} | {count:<6} | {percentage:.1f}%")
    
    print("=" * 40)
    print(f"总计文件: {total_files} 个")
    print(f"唯一后缀: {len(extension_counts)} 种")

if __name__ == "__main__":
    print("正在扫描当前目录及子目录...")
    counts, total = count_file_extensions()
    print_extension_stats(counts, total)