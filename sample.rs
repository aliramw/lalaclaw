// 示例：Rust 基础结构体和实现

struct Person {
    name: String,
    age: u32,
}

impl Person {
    fn new(name: &str, age: u32) -> Self {
        Person {
            name: String::from(name),
            age,
        }
    }

    fn greet(&self) {
        println!("你好，我叫 {}，今年 {} 岁。", self.name, self.age);
    }
}

fn main() {
    let person = Person::new("悟空", 500);
    person.greet();
}
